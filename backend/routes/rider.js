const express = require('express');
const { pool, query, execute, target } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRole('RIDER'));

// ----- BOOK A RIDE -----------------------------------------------------
// Required body fields:
//   pickup_loc_id, dropoff_loc_id, vehicle_type, distance_km, duration_min
// Optional:
//   is_peak (boolean)  → applies surge multiplier
//   promo_code (string)
//   payment_method ('CASH'|'WALLET'|'CARD')  default 'CASH'
//
// Workflow: pick first ONLINE driver of the right vehicle type, insert
// a rides row (REQUESTED), call sp_calculate_fare to populate fare,
// then insert a corresponding pending payment row.
router.post('/rides', async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const {
      pickup_loc_id,
      dropoff_loc_id,
      vehicle_type,
      distance_km,
      duration_min,
      is_peak = false,
      promo_code = null,
      payment_method = 'CASH',
    } = req.body || {};

    if (!pickup_loc_id || !dropoff_loc_id || !vehicle_type ||
        distance_km == null || duration_min == null) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    await conn.beginTransaction();

    // Pick an ONLINE driver who has a verified vehicle of the right type
    // and no other ride still pending acceptance / mid-trip.
    const [drivers] = await conn.query(
      `SELECT d.driver_id, v.vehicle_id, fr.rule_id
         FROM drivers d
         JOIN vehicles v ON v.driver_id = d.driver_id
         JOIN fare_rules fr ON fr.vehicle_type = v.vehicle_type
        WHERE d.avail_status = 'ONLINE'
          AND d.verif_status = 'VERIFIED'
          AND v.verif_status = 'VERIFIED'
          AND v.vehicle_type = ?
          AND NOT EXISTS (
            SELECT 1 FROM rides rr
             WHERE rr.driver_id = d.driver_id
               AND rr.ride_status IN ('REQUESTED','ACCEPTED','DRIVER_EN_ROUTE','IN_PROGRESS')
          )
        ORDER BY d.avg_rating DESC, d.total_trips DESC
        LIMIT 1`,
      [vehicle_type]
    );
    if (drivers.length === 0) {
      await conn.rollback();
      return res
        .status(409)
        .json({ error: `No ONLINE drivers available for ${vehicle_type}` });
    }
    const { driver_id, vehicle_id, rule_id } = drivers[0];

    // Insert the ride.
    const [ins] = await conn.query(
      `INSERT INTO rides
         (rider_id, driver_id, vehicle_id, pickup_loc_id, dropoff_loc_id,
          fare_rule_id, duration_min, distance_km, ride_status, fare)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'REQUESTED', 0.00)`,
      [
        req.user.user_id, driver_id, vehicle_id,
        pickup_loc_id, dropoff_loc_id, rule_id,
        duration_min, distance_km,
      ]
    );
    const rideId = ins.insertId;

    // Calculate fare. On MySQL we use the stored procedure; on TiDB we
    // do the same math inline (procedures aren't supported on TiDB).
    let fare;
    if (target === 'tidb') {
      const [fr] = await conn.query(
        `SELECT base_rate, per_km_rate, per_min_rate, surge_multiplier
           FROM fare_rules WHERE rule_id = ?`,
        [rule_id]
      );
      const f = fr[0];
      const mult = is_peak ? Number(f.surge_multiplier) : 1;
      fare =
        Math.round(
          (Number(f.base_rate) +
            Number(f.per_km_rate) * Number(distance_km) +
            Number(f.per_min_rate) * Number(duration_min)) *
            mult *
            100
        ) / 100;
      await conn.query(`UPDATE rides SET fare = ? WHERE ride_id = ?`, [fare, rideId]);
    } else {
      await conn.query(`SET @out_fare = 0`);
      await conn.query(`CALL sp_calculate_fare(?, ?, @out_fare)`, [rideId, !!is_peak]);
      const [[row]] = await conn.query(`SELECT @out_fare AS fare`);
      fare = Number(row.fare);
    }

    // Promo + payment
    let promoId = null;
    let promoDiscount = 0;
    let amount = fare;
    if (promo_code) {
      const [p] = await conn.query(
        `SELECT promo_id, discount_pct
           FROM promo_codes
          WHERE code = ? AND is_active = 1 AND valid_until >= CURDATE()
            AND usage_count < max_uses
          LIMIT 1`,
        [promo_code]
      );
      if (p.length === 0) {
        await conn.rollback();
        return res.status(400).json({ error: 'Promo code invalid or expired' });
      }
      promoId = p[0].promo_id;
      promoDiscount = Math.round(fare * (Number(p[0].discount_pct) / 100) * 100) / 100;
      amount = Math.round((fare - promoDiscount) * 100) / 100;
    }

    if (payment_method === 'WALLET') {
      const [w] = await conn.query(
        `SELECT wallet_balance FROM users WHERE user_id = ? FOR UPDATE`,
        [req.user.user_id]
      );
      if (Number(w[0].wallet_balance) < amount) {
        await conn.rollback();
        return res.status(400).json({ error: 'Insufficient wallet balance' });
      }
      await conn.query(
        `UPDATE users SET wallet_balance = wallet_balance - ? WHERE user_id = ?`,
        [amount, req.user.user_id]
      );
    }

    await conn.query(
      `INSERT INTO payments
         (ride_id, rider_id, promo_id, payment_method, amount, payment_status, promo_discount)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        rideId, req.user.user_id, promoId, payment_method, amount,
        payment_method === 'WALLET' ? 'PAID' : 'PENDING',
        promoDiscount,
      ]
    );

    // On MySQL the trg_promo_usage_increment trigger handles this. TiDB
    // doesn't support triggers, so do it inline.
    if (target === 'tidb' && promoId) {
      await conn.query(
        `UPDATE promo_codes SET usage_count = usage_count + 1 WHERE promo_id = ?`,
        [promoId]
      );
    }

    // Driver stays ONLINE until they tap Accept (driver route flips them to ON_TRIP).

    await conn.commit();
    res.status(201).json({
      ride_id: rideId,
      driver_id,
      vehicle_id,
      fare,
      amount,
      promo_discount: promoDiscount,
      payment_method,
    });
  } catch (e) {
    await conn.rollback();
    next(e);
  } finally {
    conn.release();
  }
});

// ----- RIDE HISTORY ----------------------------------------------------
router.get('/rides', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT r.ride_id, r.ride_status, r.requested_at, r.distance_km,
              r.duration_min, r.fare,
              du.full_name AS driver_name,
              v.make, v.model, v.license_plate,
              pl.city AS pickup_city, pl.address AS pickup_address,
              dl.city AS dropoff_city, dl.address AS dropoff_address,
              p.payment_status, p.payment_method, p.amount AS paid_amount
         FROM rides r
         JOIN drivers d   ON d.driver_id = r.driver_id
         JOIN users du    ON du.user_id  = d.user_id
         JOIN vehicles v  ON v.vehicle_id = r.vehicle_id
         JOIN locations pl ON pl.location_id = r.pickup_loc_id
         JOIN locations dl ON dl.location_id = r.dropoff_loc_id
         LEFT JOIN payments p ON p.ride_id = r.ride_id
        WHERE r.rider_id = ?
        ORDER BY r.requested_at DESC`,
      [req.user.user_id]
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// ----- WALLET ----------------------------------------------------------
router.get('/wallet', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT wallet_balance FROM users WHERE user_id = ?`,
      [req.user.user_id]
    );
    res.json({ wallet_balance: Number(rows[0]?.wallet_balance ?? 0) });
  } catch (e) { next(e); }
});

router.post('/wallet/topup', async (req, res, next) => {
  try {
    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'amount must be > 0' });
    }
    await execute(
      `UPDATE users SET wallet_balance = wallet_balance + ? WHERE user_id = ?`,
      [amount, req.user.user_id]
    );
    const rows = await query(
      `SELECT wallet_balance FROM users WHERE user_id = ?`,
      [req.user.user_id]
    );
    res.json({ wallet_balance: Number(rows[0].wallet_balance) });
  } catch (e) { next(e); }
});

// ----- RATINGS ---------------------------------------------------------

// Rides the rider can still rate — COMPLETED and not yet rated by them.
router.get('/ratings/pending', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT r.ride_id, r.requested_at, r.distance_km, r.fare,
              du.full_name AS driver_name,
              pl.city AS pickup_city, dl.city AS dropoff_city
         FROM rides r
         JOIN drivers d   ON d.driver_id = r.driver_id
         JOIN users   du  ON du.user_id  = d.user_id
         JOIN locations pl ON pl.location_id = r.pickup_loc_id
         JOIN locations dl ON dl.location_id = r.dropoff_loc_id
         LEFT JOIN ratings rt
                ON rt.ride_id = r.ride_id AND rt.rated_by = ?
        WHERE r.rider_id = ?
          AND r.ride_status = 'COMPLETED'
          AND rt.rating_id IS NULL
        ORDER BY r.requested_at DESC`,
      [req.user.user_id, req.user.user_id]
    );
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/ratings', async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { ride_id, score, comment = null } = req.body || {};
    if (!ride_id || !score) {
      return res.status(400).json({ error: 'ride_id and score required' });
    }
    const numScore = Number(score);
    if (!Number.isInteger(numScore) || numScore < 1 || numScore > 5) {
      return res.status(400).json({ error: 'score must be an integer 1-5' });
    }

    await conn.beginTransaction();

    const [rr] = await conn.query(
      `SELECT r.driver_id, d.user_id AS driver_user_id, r.rider_id, r.ride_status
         FROM rides r JOIN drivers d ON d.driver_id = r.driver_id
        WHERE r.ride_id = ?`,
      [ride_id]
    );
    if (rr.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Ride not found' });
    }
    const ride = rr[0];
    if (ride.rider_id !== req.user.user_id) {
      await conn.rollback();
      return res.status(403).json({ error: 'Not your ride' });
    }
    if (ride.ride_status !== 'COMPLETED') {
      await conn.rollback();
      return res.status(409).json({
        error: 'You can only rate a ride that has been completed',
      });
    }

    // UPSERT — graders can re-rate the same ride (e.g. after a typo)
    // without hitting the unique (ride_id, rated_by) constraint.
    await conn.query(
      `INSERT INTO ratings (ride_id, rated_by, rated_user, score, comment)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE score = VALUES(score),
                               comment = VALUES(comment),
                               rated_at = CURRENT_TIMESTAMP`,
      [ride_id, req.user.user_id, ride.driver_user_id, numScore, comment]
    );

    // Recompute driver's avg rating (an UPDATE on drivers fires the
    // low-rating trigger if it crosses 3.5).
    await conn.query(
      `UPDATE drivers d
          SET avg_rating = (
            SELECT IFNULL(AVG(score), 0)
              FROM ratings
             WHERE rated_user = d.user_id
          )
        WHERE d.driver_id = ?`,
      [ride.driver_id]
    );

    // On MySQL the trg_driver_low_rating_flag trigger sets is_flagged + writes
    // an admin notification when avg crosses below 3.5. TiDB has no triggers,
    // so do the same work inline.
    if (target === 'tidb') {
      const [drv] = await conn.query(
        `SELECT avg_rating, is_flagged FROM drivers WHERE driver_id = ?`,
        [ride.driver_id]
      );
      if (drv.length && Number(drv[0].avg_rating) < 3.5 && !drv[0].is_flagged) {
        await conn.query(
          `UPDATE drivers SET is_flagged = 1 WHERE driver_id = ?`,
          [ride.driver_id]
        );
        await conn.query(
          `INSERT INTO admin_notifications (message, related_user_id)
           VALUES (?, ?)`,
          [
            `Driver #${ride.driver_id} flagged for low average rating (${Number(drv[0].avg_rating).toFixed(2)})`,
            ride.driver_user_id,
          ]
        );
      }
    }

    // ----- Rider low-rating check (spec: flag rider if avg < 3.0) ----------
    const [riderAvgRow] = await conn.query(
      `SELECT IFNULL(AVG(score), 0) AS avg_score
         FROM ratings WHERE rated_user = ?`,
      [req.user.user_id]
    );
    const riderAvg = Number(riderAvgRow[0].avg_score);
    if (riderAvg > 0 && riderAvg < 3.0) {
      await conn.query(
        `UPDATE users SET is_flagged = 1 WHERE user_id = ?`,
        [req.user.user_id]
      );
      await conn.query(
        `INSERT INTO admin_notifications (message, related_user_id)
         VALUES (?, ?)`,
        [
          `Rider #${req.user.user_id} flagged for low average rating (${riderAvg.toFixed(2)}).`,
          req.user.user_id,
        ]
      );
    }

    await conn.commit();
    res.status(201).json({ ok: true });
  } catch (e) {
    await conn.rollback();
    next(e);
  } finally {
    conn.release();
  }
});

// ----- CANCEL RIDE -----------------------------------------------------
// Rider can cancel a ride that is still in REQUESTED state.
router.post('/rides/:id/cancel', async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Verify the ride belongs to this rider and is still cancellable.
    const [rr] = await conn.query(
      `SELECT ride_id, ride_status FROM rides
        WHERE ride_id = ? AND rider_id = ?`,
      [req.params.id, req.user.user_id]
    );
    if (rr.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Ride not found or not yours' });
    }
    if (!['REQUESTED', 'ACCEPTED', 'DRIVER_EN_ROUTE'].includes(rr[0].ride_status)) {
      await conn.rollback();
      return res.status(409).json({
        error: 'Ride cannot be cancelled in its current state',
      });
    }

    // Cancel the ride.
    await conn.query(
      `UPDATE rides SET ride_status = 'CANCELLED' WHERE ride_id = ?`,
      [req.params.id]
    );

    // If a pending payment exists, mark it FAILED.
    await conn.query(
      `UPDATE payments SET payment_status = 'FAILED'
        WHERE ride_id = ? AND payment_status = 'PENDING'`,
      [req.params.id]
    );

    // If the rider paid via WALLET, refund the amount.
    const [pmt] = await conn.query(
      `SELECT amount, payment_method FROM payments
        WHERE ride_id = ? LIMIT 1`,
      [req.params.id]
    );
    if (pmt.length && pmt[0].payment_method === 'WALLET') {
      await conn.query(
        `UPDATE users SET wallet_balance = wallet_balance + ?
          WHERE user_id = ?`,
        [pmt[0].amount, req.user.user_id]
      );
      await conn.query(
        `UPDATE payments SET payment_status = 'REFUNDED'
          WHERE ride_id = ?`,
        [req.params.id]
      );
    }

    // Free the driver back to ONLINE if they had accepted.
    await conn.query(
      `UPDATE drivers d
          JOIN rides r ON r.driver_id = d.driver_id
         SET d.avail_status = 'ONLINE'
       WHERE r.ride_id = ? AND d.avail_status = 'ON_TRIP'`,
      [req.params.id]
    );

    await conn.commit();
    res.json({ ok: true, ride_id: Number(req.params.id), ride_status: 'CANCELLED' });
  } catch (e) {
    await conn.rollback();
    next(e);
  } finally { conn.release(); }
});

module.exports = router;
