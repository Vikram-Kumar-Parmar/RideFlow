const express = require('express');
const { query, execute } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRole('ADMIN', 'SUPER_ADMIN'));

// ----- USER & VEHICLE MANAGEMENT --------------------------------------
router.get('/users', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT user_id, full_name, email, phone, role, acc_status,
              wallet_balance, reg_date
         FROM users ORDER BY reg_date DESC`
    );
    res.json(rows);
  } catch (e) { next(e); }
});

router.put('/users/:id/status', async (req, res, next) => {
  try {
    const { acc_status } = req.body || {};
    if (!['ACTIVE', 'SUSPENDED', 'BANNED'].includes(acc_status)) {
      return res.status(400).json({ error: 'invalid acc_status' });
    }
    await execute(
      `UPDATE users SET acc_status = ? WHERE user_id = ?`,
      [acc_status, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ----- DRIVER MANAGEMENT (rubric: manage users → drivers + verification)
router.get('/drivers', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT d.driver_id, d.user_id, u.full_name, u.email, u.phone,
              d.license_num, d.cnic, d.verif_status, d.avail_status,
              d.avg_rating, d.total_trips, d.is_flagged, d.wallet_balance
         FROM drivers d
         JOIN users u ON u.user_id = d.user_id
        ORDER BY d.driver_id DESC`
    );
    res.json(rows);
  } catch (e) { next(e); }
});

router.put('/drivers/:id/verify', async (req, res, next) => {
  try {
    const { verif_status } = req.body || {};
    if (!['PENDING', 'VERIFIED', 'REJECTED'].includes(verif_status)) {
      return res.status(400).json({ error: 'invalid verif_status' });
    }
    await execute(
      `UPDATE drivers SET verif_status = ? WHERE driver_id = ?`,
      [verif_status, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.put('/drivers/:id/unflag', async (req, res, next) => {
  try {
    await execute(
      `UPDATE drivers SET is_flagged = 0 WHERE driver_id = ?`,
      [req.params.id]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.get('/vehicles', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT v.*, u.full_name AS driver_name
         FROM vehicles v
         JOIN drivers d ON d.driver_id = v.driver_id
         JOIN users u   ON u.user_id   = d.user_id
        ORDER BY v.vehicle_id DESC`
    );
    res.json(rows);
  } catch (e) { next(e); }
});

router.put('/vehicles/:id/verify', async (req, res, next) => {
  try {
    const { verif_status } = req.body || {};
    if (!['PENDING', 'VERIFIED', 'REJECTED'].includes(verif_status)) {
      return res.status(400).json({ error: 'invalid verif_status' });
    }
    await execute(
      `UPDATE vehicles SET verif_status = ? WHERE vehicle_id = ?`,
      [verif_status, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ----- FARE RULES ------------------------------------------------------
router.get('/fare-rules', async (req, res, next) => {
  try {
    const rows = await query(`SELECT * FROM fare_rules ORDER BY vehicle_type`);
    res.json(rows);
  } catch (e) { next(e); }
});

router.put('/fare-rules/:id', async (req, res, next) => {
  try {
    const { base_rate, per_km_rate, per_min_rate, surge_multiplier, is_surge_active } = req.body || {};
    await execute(
      `UPDATE fare_rules
          SET base_rate=?, per_km_rate=?, per_min_rate=?,
              surge_multiplier=?, is_surge_active=?
        WHERE rule_id=?`,
      [base_rate, per_km_rate, per_min_rate, surge_multiplier,
       is_surge_active ? 1 : 0, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ----- ADMIN NOTIFICATIONS --------------------------------------------
router.get('/notifications', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT n.*, u.full_name AS related_user_name
         FROM admin_notifications n
         LEFT JOIN users u ON u.user_id = n.related_user_id
        ORDER BY n.created_at DESC LIMIT 100`
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// =====================================================================
// REPORTS — these are the rubric-required SQL queries.
// =====================================================================

// 1) Completed rides for a specific rider, ordered by date.
router.get('/reports/completed-rides', async (req, res, next) => {
  try {
    const riderId = Number(req.query.rider_id);
    if (!riderId) return res.status(400).json({ error: 'rider_id required' });
    const rows = await query(
      `SELECT r.ride_id, r.requested_at, r.distance_km, r.duration_min, r.fare,
              du.full_name AS driver_name
         FROM rides r
         JOIN drivers d  ON d.driver_id = r.driver_id
         JOIN users   du ON du.user_id  = d.user_id
        WHERE r.rider_id = ? AND r.ride_status = 'COMPLETED'
        ORDER BY r.requested_at DESC`,
      [riderId]
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// 2) Drivers in a city (based on rides started there), ordered by rating.
router.get('/reports/drivers-by-city', async (req, res, next) => {
  try {
    const city = String(req.query.city || '').trim();
    if (!city) return res.status(400).json({ error: 'city required' });
    const rows = await query(
      `SELECT DISTINCT d.driver_id, u.full_name, d.avg_rating, d.total_trips,
              d.avail_status
         FROM drivers d
         JOIN users     u  ON u.user_id = d.user_id
         JOIN rides     r  ON r.driver_id = d.driver_id
         JOIN locations pl ON pl.location_id = r.pickup_loc_id
        WHERE pl.city = ?
        ORDER BY d.avg_rating DESC, d.total_trips DESC`,
      [city]
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// 3) SUM(amount) — total platform revenue per city.
router.get('/reports/revenue-per-city', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT pl.city,
              COUNT(*) AS paid_rides,
              ROUND(SUM(p.amount), 2) AS total_revenue
         FROM payments p
         JOIN rides     r  ON r.ride_id = p.ride_id
         JOIN locations pl ON pl.location_id = r.pickup_loc_id
        WHERE p.payment_status = 'PAID'
        GROUP BY pl.city
        ORDER BY total_revenue DESC`
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// 4) COUNT(*) — total trips completed per driver.
router.get('/reports/trips-per-driver', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT d.driver_id, u.full_name AS driver_name,
              COUNT(*) AS completed_trips,
              ROUND(SUM(r.fare), 2) AS total_fare_value
         FROM rides r
         JOIN drivers d ON d.driver_id = r.driver_id
         JOIN users   u ON u.user_id   = d.user_id
        WHERE r.ride_status = 'COMPLETED'
        GROUP BY d.driver_id, u.full_name
        ORDER BY completed_trips DESC`
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// 5) AVG(score) HAVING < 3.5 — low-rated drivers.
router.get('/reports/low-rated-drivers', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT u.user_id, u.full_name, d.driver_id,
              ROUND(AVG(rt.score), 2) AS avg_score,
              COUNT(rt.rating_id)     AS rating_count
         FROM ratings rt
         JOIN users   u  ON u.user_id = rt.rated_user
         JOIN drivers d  ON d.user_id = u.user_id
        GROUP BY u.user_id, u.full_name, d.driver_id
       HAVING AVG(rt.score) < 3.5
        ORDER BY avg_score ASC`
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// 6) INNER JOIN — full trip report (riders × rides × drivers × vehicles).
router.get('/reports/full-trip-report', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT r.ride_id, r.ride_status, r.requested_at,
              r.distance_km, r.duration_min, r.fare,
              ru.full_name  AS rider_name,
              du.full_name  AS driver_name,
              v.make, v.model, v.license_plate, v.vehicle_type,
              pl.city AS pickup_city, dl.city AS dropoff_city
         FROM rides r
         INNER JOIN users    ru ON ru.user_id   = r.rider_id
         INNER JOIN drivers  d  ON d.driver_id  = r.driver_id
         INNER JOIN users    du ON du.user_id   = d.user_id
         INNER JOIN vehicles v  ON v.vehicle_id = r.vehicle_id
         INNER JOIN locations pl ON pl.location_id = r.pickup_loc_id
         INNER JOIN locations dl ON dl.location_id = r.dropoff_loc_id
        ORDER BY r.requested_at DESC LIMIT 200`
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// 7) LEFT JOIN — every rider, even those with 0 completed rides.
router.get('/reports/all-riders-with-rides', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT u.user_id, u.full_name, u.email,
              COUNT(r.ride_id) AS completed_rides
         FROM users u
         LEFT JOIN rides r
                ON r.rider_id = u.user_id AND r.ride_status = 'COMPLETED'
        WHERE u.role = 'RIDER'
        GROUP BY u.user_id, u.full_name, u.email
        ORDER BY completed_rides DESC, u.full_name`
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// 8) JOIN payments × promo_codes — discount usage per ride.
router.get('/reports/promo-discount-usage', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT p.payment_id, p.ride_id, pc.code,
              pc.discount_pct, p.promo_discount, p.amount,
              p.payment_status, p.txn_date
         FROM payments p
         JOIN promo_codes pc ON pc.promo_id = p.promo_id
        ORDER BY p.txn_date DESC`
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// Quick-glance dashboard counters used by Admin home.
router.get('/reports/summary', async (req, res, next) => {
  try {
    const [users]    = await Promise.all([query(`SELECT COUNT(*) AS c FROM users`)]);
    const drivers    = await query(`SELECT COUNT(*) AS c FROM drivers`);
    const rides      = await query(`SELECT COUNT(*) AS c FROM rides`);
    const completed  = await query(`SELECT COUNT(*) AS c FROM rides WHERE ride_status='COMPLETED'`);
    const revenue    = await query(`SELECT IFNULL(SUM(amount),0) AS s FROM payments WHERE payment_status='PAID'`);
    const flagged    = await query(`SELECT COUNT(*) AS c FROM drivers WHERE is_flagged=1`);
    res.json({
      users: users[0].c,
      drivers: drivers[0].c,
      rides: rides[0].c,
      completed_rides: completed[0].c,
      total_revenue: Number(revenue[0].s),
      flagged_drivers: flagged[0].c,
    });
  } catch (e) { next(e); }
});

// Active rides (ActiveRidesView).
router.get('/reports/active-rides', async (req, res, next) => {
  try {
    const rows = await query(`SELECT * FROM ActiveRidesView ORDER BY requested_at DESC`);
    res.json(rows);
  } catch (e) { next(e); }
});

// Top drivers (TopDriversView).
router.get('/reports/top-drivers', async (req, res, next) => {
  try {
    const rows = await query(`SELECT * FROM TopDriversView`);
    res.json(rows);
  } catch (e) { next(e); }
});

// 9) Revenue breakdown by payment method.
router.get('/reports/revenue-by-method', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT payment_method,
              COUNT(*)               AS total_transactions,
              ROUND(SUM(amount), 2)  AS total_revenue
         FROM payments
        WHERE payment_status = 'PAID'
        GROUP BY payment_method
        ORDER BY total_revenue DESC`
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// 10) Refund and dispute totals.
router.get('/reports/refunds', async (req, res, next) => {
  try {
    const refunds = await query(
      `SELECT COUNT(*)              AS refund_count,
              ROUND(SUM(amount), 2) AS total_refunded
         FROM payments
        WHERE payment_status = 'REFUNDED'`
    );
    const failed = await query(
      `SELECT COUNT(*)              AS failed_count,
              ROUND(SUM(amount), 2) AS total_failed
         FROM payments
        WHERE payment_status = 'FAILED'`
    );
    const complaints = await query(
      `SELECT comp_status, COUNT(*) AS count
         FROM complaints
        GROUP BY comp_status`
    );
    res.json({
      refunds: refunds[0],
      failed_payments: failed[0],
      complaints_by_status: complaints,
    });
  } catch (e) { next(e); }
});

// ----- PROMO CODE MANAGEMENT -------------------------------------------

router.get('/promo-codes', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT * FROM promo_codes ORDER BY promo_id DESC`
    );
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/promo-codes', async (req, res, next) => {
  try {
    const { code, discount_pct, valid_until, max_uses = 100 } = req.body || {};
    if (!code || !discount_pct || !valid_until) {
      return res.status(400).json({ error: 'code, discount_pct, and valid_until are required' });
    }
    const pct = Number(discount_pct);
    if (pct <= 0 || pct > 100) {
      return res.status(400).json({ error: 'discount_pct must be between 0 and 100' });
    }
    const result = await execute(
      `INSERT INTO promo_codes (code, discount_pct, valid_until, max_uses, is_active)
       VALUES (?, ?, ?, ?, 1)`,
      [String(code).toUpperCase(), pct, valid_until, Number(max_uses)]
    );
    res.status(201).json({ ok: true, promo_id: result.insertId });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Promo code already exists' });
    }
    next(e);
  }
});

router.put('/promo-codes/:id', async (req, res, next) => {
  try {
    const { discount_pct, valid_until, max_uses, is_active } = req.body || {};
    await execute(
      `UPDATE promo_codes
          SET discount_pct  = COALESCE(?, discount_pct),
              valid_until   = COALESCE(?, valid_until),
              max_uses      = COALESCE(?, max_uses),
              is_active     = COALESCE(?, is_active)
        WHERE promo_id = ?`,
      [
        discount_pct != null ? Number(discount_pct) : null,
        valid_until || null,
        max_uses    != null ? Number(max_uses) : null,
        is_active   != null ? (is_active ? 1 : 0) : null,
        req.params.id,
      ]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ----- COMPLAINTS MANAGEMENT -------------------------------------------

router.get('/complaints', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT c.*,
              fb.full_name  AS filed_by_name,
              ag.full_name  AS against_user_name
         FROM complaints c
         JOIN users fb ON fb.user_id = c.filed_by
         JOIN users ag ON ag.user_id = c.against_user
        ORDER BY c.filed_at DESC`
    );
    res.json(rows);
  } catch (e) { next(e); }
});

router.put('/complaints/:id/resolve', async (req, res, next) => {
  try {
    const { comp_status } = req.body || {};
    if (!['IN_PROGRESS', 'RESOLVED', 'REJECTED'].includes(comp_status)) {
      return res.status(400).json({ error: 'invalid comp_status' });
    }
    await execute(
      `UPDATE complaints SET comp_status = ? WHERE complaint_id = ?`,
      [comp_status, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ----- DRIVER PAYOUT MANAGEMENT ----------------------------------------

// List all driver_earnings with payout_status = 'PENDING'.
router.get('/payouts', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT de.earning_id, de.ride_id, de.driver_id,
              u.full_name AS driver_name,
              de.gross_fare, de.commission_pct, de.net_earning,
              de.payout_status, de.earned_at
         FROM driver_earnings de
         JOIN drivers d ON d.driver_id = de.driver_id
         JOIN users   u ON u.user_id   = d.user_id
        WHERE de.payout_status = 'PENDING'
        ORDER BY de.earned_at DESC`
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// Process all pending payouts for a specific driver.
router.post('/payouts/process', async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const driverId = Number(req.body?.driver_id);
    if (!driverId) {
      return res.status(400).json({ error: 'driver_id required' });
    }

    await conn.beginTransaction();

    // Sum all pending net earnings for this driver.
    const [pending] = await conn.query(
      `SELECT IFNULL(SUM(net_earning), 0) AS total_pending,
              COUNT(*) AS earning_count
         FROM driver_earnings
        WHERE driver_id = ? AND payout_status = 'PENDING'`,
      [driverId]
    );
    const totalPending = Number(pending[0].total_pending);
    const earningCount = Number(pending[0].earning_count);

    if (earningCount === 0) {
      await conn.rollback();
      return res.status(409).json({ error: 'No pending payouts for this driver' });
    }

    // Mark all pending earnings as PAID.
    await conn.query(
      `UPDATE driver_earnings SET payout_status = 'PAID'
        WHERE driver_id = ? AND payout_status = 'PENDING'`,
      [driverId]
    );

    // The driver wallet already has the balance accumulated at trip finish.
    // This endpoint just marks earnings as officially paid out.

    await conn.commit();
    res.json({ ok: true, driver_id: driverId, total_paid_out: totalPending, earning_count: earningCount });
  } catch (e) {
    await conn.rollback();
    next(e);
  } finally { conn.release(); }
});

module.exports = router;
