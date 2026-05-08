-- =====================================================================
-- RideFlow seed — minimal CONFIG only.
-- No transactional dummy data is seeded (no rides, no payments,
-- no ratings, no earnings, no notifications). Per the rubric, all such
-- rows are inserted at runtime through the live UI flows.
--
-- The only rows we keep are:
--   * 3 demo login accounts (admin / rider / driver) so graders can
--     sign in without registering first.
--   * The demo driver's `drivers` row + 1 verified vehicle so the
--     ride-booking flow works out of the box (no admin pre-step needed).
--   * Reference / config tables: locations, fare_rules, promo_codes.
-- =====================================================================

USE databaseProject_db;

-- ---- USERS ----------------------------------------------------------
-- bcrypt hash of "password" (cost 10):
--   $2a$10$LRTIO3Hazbt6B8DJj2mQvuNqTskjWTjs2YUxAoCQ5YaS5cNWpOxwK
INSERT INTO users (full_name, email, phone, password_hash, role, wallet_balance) VALUES
 ('Admin Demo',  'admin@demo.com',  '+923000000001', '$2a$10$LRTIO3Hazbt6B8DJj2mQvuNqTskjWTjs2YUxAoCQ5YaS5cNWpOxwK', 'ADMIN',  0.00),
 ('Rider Demo',  'rider@demo.com',  '+923000000002', '$2a$10$LRTIO3Hazbt6B8DJj2mQvuNqTskjWTjs2YUxAoCQ5YaS5cNWpOxwK', 'RIDER',  0.00),
 ('Driver Demo', 'driver@demo.com', '+923000000003', '$2a$10$LRTIO3Hazbt6B8DJj2mQvuNqTskjWTjs2YUxAoCQ5YaS5cNWpOxwK', 'DRIVER', 0.00);

-- ---- DRIVER PROFILE for the demo driver -----------------------------
-- VERIFIED + OFFLINE — graders flip the toggle online from the UI.
INSERT INTO drivers (user_id, license_num, cnic, verif_status, avail_status, avg_rating, total_trips, wallet_balance) VALUES
 ((SELECT user_id FROM users WHERE email='driver@demo.com'),
  'LIC-DEMO-001', '42101-0000001-1', 'VERIFIED', 'OFFLINE', 0.00, 0, 0.00);

-- ---- LOCATIONS (config / dropdown source) --------------------------
INSERT INTO locations (latitude, longitude, city, address, label) VALUES
 (24.8607, 67.0011, 'Karachi',   'Saddar, Karachi',          'Saddar'),
 (24.8138, 67.0301, 'Karachi',   'DHA Phase 5, Karachi',     'DHA-5'),
 (24.9056, 67.0822, 'Karachi',   'Gulshan-e-Iqbal, Karachi', 'Gulshan'),
 (31.5497, 74.3436, 'Lahore',    'Mall Road, Lahore',        'Mall Rd'),
 (31.4697, 74.2728, 'Lahore',    'Johar Town, Lahore',       'Johar'),
 (33.6844, 73.0479, 'Islamabad', 'F-8 Markaz, Islamabad',    'F-8');

-- ---- FARE RULES (config) -------------------------------------------
INSERT INTO fare_rules (vehicle_type, base_rate, per_km_rate, per_min_rate, surge_multiplier, is_surge_active) VALUES
 ('ECONOMY', 100.00, 25.00, 3.00, 1.50, 0),
 ('PREMIUM', 200.00, 45.00, 5.00, 1.75, 0),
 ('BIKE',     50.00, 15.00, 2.00, 1.30, 0);

-- ---- ONE VEHICLE for the demo driver -------------------------------
-- VERIFIED so the demo driver can immediately receive ECONOMY ride
-- requests after toggling ONLINE from the UI.
INSERT INTO vehicles (driver_id, make, model, vehicle_year, color, license_plate, vehicle_type, verif_status) VALUES
 ((SELECT driver_id FROM drivers WHERE license_num='LIC-DEMO-001'),
  'Toyota', 'Corolla', 2022, 'White', 'DEMO-001', 'ECONOMY', 'VERIFIED');

-- ---- PROMO CODES (config) -------------------------------------------
-- One active code (WELCOME10) so the promo flow can be demonstrated.
-- One already-expired code (OLDPROMO) so the nightly expire event has
-- something to operate on during the viva demo.
INSERT INTO promo_codes (code, discount_pct, valid_until, max_uses, is_active) VALUES
 ('WELCOME10', 10.00, DATE_ADD(CURDATE(), INTERVAL  60 DAY), 1000, 1),
 ('OLDPROMO',   5.00, DATE_SUB(CURDATE(), INTERVAL   1 DAY),   10, 1);
