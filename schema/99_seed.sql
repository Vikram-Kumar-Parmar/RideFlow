-- =====================================================================
-- D3 — Seed data so the dashboards aren't empty during the demo.
-- Passwords below are bcrypt hashes of the literal string "password".
-- =====================================================================

USE databaseProject_db;

-- ---- USERS ---------------------------------------------------------
-- bcrypt hash of "password" (cost 10):
--   $2a$10$LRTIO3Hazbt6B8DJj2mQvuNqTskjWTjs2YUxAoCQ5YaS5cNWpOxwK
INSERT INTO users (full_name, email, phone, password_hash, role, wallet_balance) VALUES
 ('Admin Demo',  'admin@demo.com',  '+923000000001', '$2a$10$LRTIO3Hazbt6B8DJj2mQvuNqTskjWTjs2YUxAoCQ5YaS5cNWpOxwK', 'ADMIN',   0.00),
 ('Rider One',   'rider@demo.com',  '+923000000002', '$2a$10$LRTIO3Hazbt6B8DJj2mQvuNqTskjWTjs2YUxAoCQ5YaS5cNWpOxwK', 'RIDER',   500.00),
 ('Rider Two',   'rider2@demo.com', '+923000000003', '$2a$10$LRTIO3Hazbt6B8DJj2mQvuNqTskjWTjs2YUxAoCQ5YaS5cNWpOxwK', 'RIDER',   200.00),
 ('Rider Three', 'rider3@demo.com', '+923000000004', '$2a$10$LRTIO3Hazbt6B8DJj2mQvuNqTskjWTjs2YUxAoCQ5YaS5cNWpOxwK', 'RIDER',   100.00),
 ('Driver Ali',  'driver@demo.com', '+923000000005', '$2a$10$LRTIO3Hazbt6B8DJj2mQvuNqTskjWTjs2YUxAoCQ5YaS5cNWpOxwK', 'DRIVER',  0.00),
 ('Driver Sara', 'driver2@demo.com','+923000000006', '$2a$10$LRTIO3Hazbt6B8DJj2mQvuNqTskjWTjs2YUxAoCQ5YaS5cNWpOxwK', 'DRIVER',  0.00),
 ('Driver Bilal','driver3@demo.com','+923000000007', '$2a$10$LRTIO3Hazbt6B8DJj2mQvuNqTskjWTjs2YUxAoCQ5YaS5cNWpOxwK', 'DRIVER',  0.00);

-- ---- DRIVERS -------------------------------------------------------
INSERT INTO drivers (user_id, license_num, cnic, verif_status, avail_status, avg_rating, total_trips, wallet_balance) VALUES
 ((SELECT user_id FROM users WHERE email='driver@demo.com'),  'LIC-A001', '42101-1111111-1', 'VERIFIED', 'ONLINE',  4.80, 50, 1200.00),
 ((SELECT user_id FROM users WHERE email='driver2@demo.com'), 'LIC-A002', '42101-2222222-2', 'VERIFIED', 'OFFLINE', 4.20, 30,  800.00),
 ((SELECT user_id FROM users WHERE email='driver3@demo.com'), 'LIC-A003', '42101-3333333-3', 'VERIFIED', 'ONLINE',  3.90, 12,  300.00);

-- ---- LOCATIONS -----------------------------------------------------
INSERT INTO locations (latitude, longitude, city, address, label) VALUES
 (24.8607, 67.0011, 'Karachi',  'Saddar, Karachi',          'Saddar'),
 (24.8138, 67.0301, 'Karachi',  'DHA Phase 5, Karachi',     'DHA-5'),
 (24.9056, 67.0822, 'Karachi',  'Gulshan-e-Iqbal, Karachi', 'Gulshan'),
 (31.5497, 74.3436, 'Lahore',   'Mall Road, Lahore',        'Mall Rd'),
 (31.4697, 74.2728, 'Lahore',   'Johar Town, Lahore',       'Johar'),
 (33.6844, 73.0479, 'Islamabad','F-8 Markaz, Islamabad',    'F-8');

-- ---- FARE RULES ----------------------------------------------------
INSERT INTO fare_rules (vehicle_type, base_rate, per_km_rate, per_min_rate, surge_multiplier, is_surge_active) VALUES
 ('ECONOMY', 100.00, 25.00, 3.00, 1.50, 0),
 ('PREMIUM', 200.00, 45.00, 5.00, 1.75, 0),
 ('BIKE',     50.00, 15.00, 2.00, 1.30, 0);

-- ---- VEHICLES ------------------------------------------------------
INSERT INTO vehicles (driver_id, make, model, vehicle_year, color, license_plate, vehicle_type, verif_status) VALUES
 ((SELECT driver_id FROM drivers WHERE license_num='LIC-A001'), 'Toyota','Corolla', 2020, 'White', 'AAA-001', 'ECONOMY', 'VERIFIED'),
 ((SELECT driver_id FROM drivers WHERE license_num='LIC-A002'), 'Honda', 'City',    2021, 'Black', 'BBB-002', 'PREMIUM', 'VERIFIED'),
 ((SELECT driver_id FROM drivers WHERE license_num='LIC-A003'), 'Suzuki','GD110',   2022, 'Red',   'CCC-003', 'BIKE',    'VERIFIED');

-- ---- PROMO CODES ---------------------------------------------------
INSERT INTO promo_codes (code, discount_pct, valid_until, max_uses, is_active) VALUES
 ('WELCOME10', 10.00, DATE_ADD(CURDATE(), INTERVAL  30 DAY), 100, 1),
 ('SUMMER20',  20.00, DATE_ADD(CURDATE(), INTERVAL  60 DAY),  50, 1),
 ('OLDPROMO',   5.00, DATE_SUB(CURDATE(), INTERVAL   1 DAY),  10, 1); -- already expired (event will deactivate)

-- ---- A FEW RIDES + PAYMENTS so reports show data ------------------
INSERT INTO rides (rider_id, driver_id, vehicle_id, pickup_loc_id, dropoff_loc_id, fare_rule_id,
                   duration_min, distance_km, ride_status, fare)
VALUES
 ((SELECT user_id   FROM users    WHERE email='rider@demo.com'),
  (SELECT driver_id FROM drivers  WHERE license_num='LIC-A001'),
  (SELECT vehicle_id FROM vehicles WHERE license_plate='AAA-001'),
  (SELECT location_id FROM locations WHERE address='Saddar, Karachi'),
  (SELECT location_id FROM locations WHERE address='DHA Phase 5, Karachi'),
  (SELECT rule_id FROM fare_rules WHERE vehicle_type='ECONOMY'),
  18, 9.50, 'COMPLETED', 0.00),
 ((SELECT user_id   FROM users    WHERE email='rider2@demo.com'),
  (SELECT driver_id FROM drivers  WHERE license_num='LIC-A002'),
  (SELECT vehicle_id FROM vehicles WHERE license_plate='BBB-002'),
  (SELECT location_id FROM locations WHERE address='Mall Road, Lahore'),
  (SELECT location_id FROM locations WHERE address='Johar Town, Lahore'),
  (SELECT rule_id FROM fare_rules WHERE vehicle_type='PREMIUM'),
  25, 12.00, 'COMPLETED', 0.00),
 ((SELECT user_id   FROM users    WHERE email='rider@demo.com'),
  (SELECT driver_id FROM drivers  WHERE license_num='LIC-A003'),
  (SELECT vehicle_id FROM vehicles WHERE license_plate='CCC-003'),
  (SELECT location_id FROM locations WHERE address='Gulshan-e-Iqbal, Karachi'),
  (SELECT location_id FROM locations WHERE address='Saddar, Karachi'),
  (SELECT rule_id FROM fare_rules WHERE vehicle_type='BIKE'),
  10, 4.20, 'IN_PROGRESS', 0.00);

-- Pre-compute fares manually so seed doesn't depend on the procedure
UPDATE rides SET fare = ROUND((100 + 25*9.50 + 3*18) * 1.00, 2) WHERE distance_km=9.50;
UPDATE rides SET fare = ROUND((200 + 45*12.00 + 5*25) * 1.00, 2) WHERE distance_km=12.00;
UPDATE rides SET fare = ROUND((50 + 15*4.20 + 2*10) * 1.00, 2) WHERE distance_km=4.20;

-- ---- PAYMENTS ------------------------------------------------------
-- Resolve promo_id into a session variable first; otherwise the trigger
-- trg_promo_usage_increment can't update promo_codes while it's still
-- being read by the same INSERT…SELECT statement.
SET @welcome_promo := (SELECT promo_id FROM promo_codes WHERE code='WELCOME10');
INSERT INTO payments (ride_id, rider_id, promo_id, payment_method, amount, payment_status, promo_discount)
SELECT r.ride_id, r.rider_id, @welcome_promo,
       'WALLET', r.fare * 0.90, 'PAID', r.fare * 0.10
FROM rides r WHERE r.distance_km=9.50;

INSERT INTO payments (ride_id, rider_id, promo_id, payment_method, amount, payment_status, promo_discount)
SELECT r.ride_id, r.rider_id, NULL, 'CARD', r.fare, 'PAID', 0
FROM rides r WHERE r.distance_km=12.00;

INSERT INTO payments (ride_id, rider_id, promo_id, payment_method, amount, payment_status, promo_discount)
SELECT r.ride_id, r.rider_id, NULL, 'CASH', r.fare, 'PENDING', 0
FROM rides r WHERE r.distance_km=4.20;

-- ---- RATINGS -------------------------------------------------------
INSERT INTO ratings (ride_id, rated_by, rated_user, score, comment)
SELECT r.ride_id, r.rider_id,
       (SELECT user_id FROM drivers d WHERE d.driver_id = r.driver_id),
       5, 'Great driver'
FROM rides r WHERE r.distance_km=9.50;

INSERT INTO ratings (ride_id, rated_by, rated_user, score, comment)
SELECT r.ride_id, r.rider_id,
       (SELECT user_id FROM drivers d WHERE d.driver_id = r.driver_id),
       4, 'Good ride'
FROM rides r WHERE r.distance_km=12.00;

-- ---- DRIVER EARNINGS (20% commission) ------------------------------
INSERT INTO driver_earnings (ride_id, driver_id, gross_fare, commission_pct, net_earning, payout_status)
SELECT r.ride_id, r.driver_id, r.fare, 20.00, ROUND(r.fare * 0.80, 2), 'PAID'
FROM rides r WHERE r.ride_status='COMPLETED';
