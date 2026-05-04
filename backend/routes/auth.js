const express = require('express');
const bcrypt = require('bcryptjs');
const { query, execute } = require('../db');
const { signToken } = require('../middleware/auth');

const router = express.Router();

router.post('/register', async (req, res, next) => {
  try {
    const { full_name, email, phone, password, role } = req.body || {};
    if (!full_name || !email || !phone || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const wantedRole = String(role || 'RIDER').toUpperCase();
    if (!['RIDER', 'DRIVER', 'ADMIN'].includes(wantedRole)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    const hash = bcrypt.hashSync(password, 10);
    const result = await execute(
      `INSERT INTO users (full_name, email, phone, password_hash, role)
       VALUES (?, ?, ?, ?, ?)`,
      [full_name, email, phone, hash, wantedRole]
    );
    const userId = result.insertId;

    if (wantedRole === 'DRIVER') {
      const { license_num, cnic } = req.body;
      if (!license_num || !cnic) {
        return res.status(400).json({
          error: 'license_num and cnic are required for DRIVER registration',
        });
      }
      await execute(
        `INSERT INTO drivers (user_id, license_num, cnic) VALUES (?, ?, ?)`,
        [userId, license_num, cnic]
      );
    }

    const token = signToken({ user_id: userId, role: wantedRole, email });
    res.status(201).json({ token, user: { user_id: userId, full_name, email, role: wantedRole } });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Email or phone already in use' });
    }
    next(e);
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
