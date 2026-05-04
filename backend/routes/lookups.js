const express = require('express');
const { query } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

router.get('/locations', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT location_id, latitude, longitude, city, address, label
         FROM locations ORDER BY city, address`
    );
    res.json(rows);
  } catch (e) { next(e); }
});

router.get('/promo-codes/active', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT promo_id, code, discount_pct, valid_until, max_uses, usage_count
         FROM promo_codes
        WHERE is_active = 1 AND valid_until >= CURDATE()
        ORDER BY valid_until`
    );
    res.json(rows);
  } catch (e) { next(e); }
});

router.get('/fare-rules', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT rule_id, vehicle_type, base_rate, per_km_rate, per_min_rate,
              surge_multiplier, is_surge_active
         FROM fare_rules ORDER BY vehicle_type`
    );
    res.json(rows);
  } catch (e) { next(e); }
});

module.exports = router;
