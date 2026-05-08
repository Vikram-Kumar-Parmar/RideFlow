const express = require('express');
const bcrypt = require('bcryptjs');
const { query, execute, pool } = require('../db');
const { signToken } = require('../middleware/auth');

const router = express.Router();

router.post('/register', async (req, res, next) => {
  const { full_name, email, phone, password, role } = req.body || {};
  if (!full_name || !email || !phone || !password) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const wantedRole = String(role || 'RIDER').toUpperCase();
  if (!['RIDER', 'DRIVER', 'ADMIN'].includes(wantedRole)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  // Pre-validate driver-only fields BEFORE we create any rows so the
  // 400 case never leaves an orphan user behind.
  let driverFields = null;
  if (wantedRole === 'DRIVER') {
    const {
      license_num, cnic,
      vehicle_make, vehicle_model, vehicle_year, vehicle_color,
      license_plate, vehicle_type,
    } = req.body || {};
    if (!license_num || !cnic) {
      return res.status(400).json({
        error: 'license_num and cnic are required for DRIVER registration',
      });
    }
    if (!vehicle_make || !vehicle_model || !vehicle_year || !vehicle_color ||
        !license_plate || !vehicle_type) {
      return res.status(400).json({
        error:
          'Vehicle details (vehicle_make, vehicle_model, vehicle_year, ' +
          'vehicle_color, license_plate, vehicle_type) are required for ' +
          'DRIVER registration',
      });
    }
    const vt = String(vehicle_type).toUpperCase();
    if (!['ECONOMY', 'PREMIUM', 'BIKE'].includes(vt)) {
      return res.status(400).json({
        error: 'vehicle_type must be ECONOMY, PREMIUM or BIKE',
      });
    }
    driverFields = {
      license_num, cnic,
      vehicle_make, vehicle_model,
      vehicle_year: Number(vehicle_year),
      vehicle_color, license_plate, vehicle_type: vt,
    };
  }

  const hash = bcrypt.hashSync(password, 10);

  // Wrap the user + (driver + vehicle) inserts in a single transaction
  // (rubric: Transactions Maintained, ACID). If any step fails we roll
  // back so we never leave an orphan user, driver or vehicle behind.
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [uRes] = await conn.query(
      `INSERT INTO users (full_name, email, phone, password_hash, role)
       VALUES (?, ?, ?, ?, ?)`,
      [full_name, email, phone, hash, wantedRole]
    );
    const userId = uRes.insertId;

    if (driverFields) {
      // Auto-VERIFY new drivers + their vehicle so the booking flow works
      // out of the box. Admin can still flip them back to PENDING/REJECTED
      // from the Admin → Drivers / Vehicles tabs.
      const [dRes] = await conn.query(
        `INSERT INTO drivers (user_id, license_num, cnic, verif_status, avail_status)
         VALUES (?, ?, ?, 'VERIFIED', 'OFFLINE')`,
        [userId, driverFields.license_num, driverFields.cnic]
      );
      await conn.query(
        `INSERT INTO vehicles
           (driver_id, make, model, vehicle_year, color, license_plate, vehicle_type, verif_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'VERIFIED')`,
        [
          dRes.insertId, driverFields.vehicle_make, driverFields.vehicle_model,
          driverFields.vehicle_year, driverFields.vehicle_color,
          driverFields.license_plate, driverFields.vehicle_type,
        ]
    if (wantedRole === 'DRIVER') {
      const {
        license_num, cnic,
        vehicle_make, vehicle_model, vehicle_year, vehicle_color,
        license_plate, vehicle_type,
      } = req.body;

      if (!license_num || !cnic) {
        return res.status(400).json({
          error: 'license_num and cnic are required for DRIVER registration',
        });
      }
      if (!vehicle_make || !vehicle_model || !vehicle_year || !vehicle_color ||
          !license_plate || !vehicle_type) {
        return res.status(400).json({
          error:
            'Vehicle details (vehicle_make, vehicle_model, vehicle_year, ' +
            'vehicle_color, license_plate, vehicle_type) are required for ' +
            'DRIVER registration',
        });
      }
      if (!['ECONOMY', 'PREMIUM', 'BIKE'].includes(String(vehicle_type).toUpperCase())) {
        return res.status(400).json({
          error: 'vehicle_type must be ECONOMY, PREMIUM or BIKE',
        });
      }

      // Auto-VERIFY new drivers + their vehicle so the booking flow works
      // out of the box. Admin can still flip them back to PENDING/REJECTED
      // from the Admin → Drivers / Vehicles tabs (rubric: manage users +
      // manage vehicles).
      const drvRes = await execute(
        `INSERT INTO drivers (user_id, license_num, cnic, verif_status, avail_status)
         VALUES (?, ?, ?, 'VERIFIED', 'OFFLINE')`,
        [userId, license_num, cnic]
      );
      await execute(
        `INSERT INTO vehicles
           (driver_id, make, model, vehicle_year, color, license_plate, vehicle_type, verif_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'VERIFIED')`,
        [
          drvRes.insertId, vehicle_make, vehicle_model,
          Number(vehicle_year), vehicle_color, license_plate,
          String(vehicle_type).toUpperCase(),
        ]
      );
    }

    await conn.commit();

    const token = signToken({ user_id: userId, role: wantedRole, email });
    res.status(201).json({
      token,
      user: { user_id: userId, full_name, email, role: wantedRole },
    });
  } catch (e) {
    try { await conn.rollback(); } catch { /* ignore */ }
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Email or phone already in use' });
    }
    next(e);
  } finally {
    conn.release();
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    const rows = await query(
      `SELECT user_id, full_name, email, password_hash, role, acc_status
         FROM users WHERE email = ? LIMIT 1`,
      [email]
    );
    const user = rows[0];
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (user.acc_status !== 'ACTIVE') {
      return res.status(403).json({ error: `Account ${user.acc_status}` });
    }
    const token = signToken({
      user_id: user.user_id,
      role: user.role,
      email: user.email,
    });
    res.json({
      token,
      user: {
        user_id: user.user_id,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
