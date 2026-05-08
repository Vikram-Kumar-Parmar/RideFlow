const express = require('express');
const { pool, query, execute } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRole('DRIVER'));

async function getDriverId(userId) {
  const rows = await query(
    `SELECT driver_id FROM drivers WHERE user_id = ?`,
    [userId]
  );
  return rows[0]?.driver_id;
}

// ----- AVAILABILITY (Online/Offline) ----------------------------------
router.put('/availability', async (req, res, next) => {
  try {
    const status = String(req.body?.avail_status || '').toUpperCase();
    if (!['ONLINE', 'OFFLINE'].includes(status)) {
      return res.status(400).json({ error: 'avail_status must be ONLINE or OFFLINE' });
    }
    const driverId = await getDriverId(req.user.user_id);
    if (!driverId) return res.status(404).json({ error: 'Driver profile missing' });
    await execute(
      `UPDATE drivers SET avail_status = ? WHERE driver_id = ?`,
      [status, driverId]
    );
    res.json({ avail_status: status });
  } catch (e) { next(e); }
});

router.get('/me', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT d.*, u.full_name, u.email, u.phone
         FROM drivers d JOIN users u ON u.user_id = d.user_id
        WHERE d.user_id = ?`,
      [req.user.user_id]
    );
    res.json(rows[0] || null);
  } catch (e) { next(e); }
});

// ----- INCOMING REQUESTS ----------------------------------------------
// Per the rubric, only ONLINE drivers should see incoming queue.
router.get('/incoming', async (req, res, next) => {
  try {
    const driverId = await getDriverId(req.user.user_id);
    const drv = await query(
      `SELECT avail_status FROM drivers WHERE driver_id = ?`,
      [driverId]
    );
    if (!drv[0] || drv[0].avail_status !== 'ONLINE') {
      return res.json([]); // offline drivers see no requests
    }
    const rows = await query(
      `SELECT r.ride_id, r.requested_at, r.distance_km, r.duration_min, r.fare,
              ru.full_name AS rider_name, ru.phone AS rider_phone,
              pl.city AS pickup_city, pl.address AS pickup_address,
              dl.city AS dropoff_city, dl.address AS dropoff_address
         FROM rides r
         JOIN users ru ON ru.user_id = r.rider_id
         JOIN locations pl ON pl.location_id = r.pickup_loc_id
         JOIN locations dl ON dl.location_id = r.dropoff_loc_id
        WHERE r.driver_id = ? AND r.ride_status = 'REQUESTED'
        ORDER BY r.requested_at`,
      [driverId]
    );
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/rides/:id/accept', async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const driverId = await getDriverId(req.user.user_id);
    await conn.beginTransaction();
    const [u] = await conn.query(
      `UPDATE rides SET ride_status = 'ACCEPTED'
        WHERE ride_id = ? AND driver_id = ? AND ride_status = 'REQUESTED'`,
      [req.params.id, driverId]
    );
    if (u.affectedRows === 0) {
      await conn.rollback();
      return res.status(409).json({ error: 'Ride no longer available' });
    }
    await conn.query(
      `UPDATE drivers SET avail_status = 'ON_TRIP' WHERE driver_id = ?`,
      [driverId]
    );
    await conn.commit();
    res.json({ ok: true, ride_id: Number(req.params.id), ride_status: 'ACCEPTED' });
  } catch (e) {
    await conn.rollback();
    next(e);
  } finally { conn.release(); }
});

router.post('/rides/:id/reject', async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const driverId = await getDriverId(req.user.user_id);
    await conn.beginTransaction();
    const [u] = await conn.query(
      `UPDATE rides SET ride_status = 'CANCELLED'
        WHERE ride_id = ? AND driver_id = ? AND ride_status = 'REQUESTED'`,
      [req.params.id, driverId]
    );
    await conn.query(
      `UPDATE drivers SET avail_status = 'ONLINE' WHERE driver_id = ?`,
      [driverId]
    );
    await conn.commit();
    if (u.affectedRows === 0) {
      return res.status(409).json({ error: 'Ride no longer in REQUESTED state' });
    }
    res.json({ ok: true, ride_id: Number(req.params.id), ride_status: 'CANCELLED' });
  } catch (e) {
    await conn.rollback();
    next(e);
  } finally { conn.release(); }
});

// Mark IN_PROGRESS / mark payment paid (which triggers ride completion).
router.post('/rides/:id/start', async (req, res, next) => {
  try {
    const driverId = await getDriverId(req.user.user_id);
    const result = await execute(
      `UPDATE rides SET ride_status = 'IN_PROGRESS'
        WHERE ride_id = ? AND driver_id = ? AND ride_status = 'ACCEPTED'`,
      [req.params.id, driverId]
    );
    if (result.affectedRows === 0) {
      return res.status(409).json({ error: 'Ride not in ACCEPTED state' });
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/rides/:id/finish', async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const driverId = await getDriverId(req.user.user_id);
    await conn.beginTransaction();

    // Mark payment PAID — the trigger on payments will mark the ride COMPLETED.
    const [u] = await conn.query(
      `UPDATE payments p JOIN rides r ON r.ride_id = p.ride_id
          SET p.payment_status = 'PAID'
        WHERE p.ride_id = ? AND r.driver_id = ?
          AND p.payment_status = 'PENDING'`,
      [req.params.id, driverId]
    );

    // On TiDB the trigger doesn't exist — explicitly complete the ride.
    await conn.query(
      `UPDATE rides SET ride_status = 'COMPLETED'
        WHERE ride_id = ? AND driver_id = ?
          AND ride_status IN ('IN_PROGRESS', 'ACCEPTED')`,
      [req.params.id, driverId]
    );

    // Earnings (20 % commission), driver wallet, total_trips.
    const [rideRows] = await conn.query(
      `SELECT fare FROM rides WHERE ride_id = ?`, [req.params.id]
    );
    const fare = Number(rideRows[0]?.fare || 0);
    const net = Math.round(fare * 0.80 * 100) / 100;

    await conn.query(
      `INSERT IGNORE INTO driver_earnings
         (ride_id, driver_id, gross_fare, commission_pct, net_earning, payout_status)
       VALUES (?, ?, ?, 20.00, ?, 'PAID')`,
      [req.params.id, driverId, fare, net]
    );
    await conn.query(
      `UPDATE drivers
          SET wallet_balance = wallet_balance + ?,
              total_trips    = total_trips + 1,
              avail_status   = 'ONLINE'
        WHERE driver_id = ?`,
      [net, driverId]
    );

    await conn.commit();
    res.json({ ok: true, net_earning: net, payment_updated: u.affectedRows });
  } catch (e) {
    await conn.rollback();
    next(e);
  } finally { conn.release(); }
});

// ----- HISTORY + EARNINGS ---------------------------------------------
router.get('/history', async (req, res, next) => {
  try {
    const driverId = await getDriverId(req.user.user_id);
    const rows = await query(
      `SELECT r.ride_id, r.ride_status, r.requested_at, r.distance_km,
              r.duration_min, r.fare,
              ru.full_name AS rider_name,
              pl.city AS pickup_city, dl.city AS dropoff_city
         FROM rides r
         JOIN users ru ON ru.user_id = r.rider_id
         JOIN locations pl ON pl.location_id = r.pickup_loc_id
         JOIN locations dl ON dl.location_id = r.dropoff_loc_id
        WHERE r.driver_id = ?
        ORDER BY r.requested_at DESC`,
      [driverId]
    );
    res.json(rows);
  } catch (e) { next(e); }
});

router.get('/earnings', async (req, res, next) => {
  try {
    const driverId = await getDriverId(req.user.user_id);
    const summary = await query(
      `SELECT COUNT(*)            AS trips_paid,
              IFNULL(SUM(net_earning), 0) AS total_net,
              IFNULL(SUM(gross_fare), 0)  AS total_gross
         FROM driver_earnings WHERE driver_id = ?`,
      [driverId]
    );
    const recent = await query(
      `SELECT earning_id, ride_id, gross_fare, commission_pct, net_earning,
              payout_status, earned_at
         FROM driver_earnings
        WHERE driver_id = ?
        ORDER BY earned_at DESC LIMIT 50`,
      [driverId]
    );
    const wallet = await query(
      `SELECT wallet_balance FROM drivers WHERE driver_id = ?`,
      [driverId]
    );
    res.json({
      summary: summary[0],
      wallet_balance: Number(wallet[0]?.wallet_balance || 0),
      recent,
    });
  } catch (e) { next(e); }
});

module.exports = router;
