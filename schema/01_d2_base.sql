DROP DATABASE IF EXISTS databaseProject_db;
CREATE DATABASE databaseProject_db;
USE databaseProject_db;

-- 1) USERS TABLE:

CREATE TABLE users (
  user_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'RIDER',
  acc_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  reg_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uk_users_email UNIQUE (email),
  CONSTRAINT uk_users_phone UNIQUE (phone),
  CONSTRAINT chk_users_role CHECK (role IN ('ADMIN', 'SUPER_ADMIN', 'RIDER', 'DRIVER')),
  CONSTRAINT chk_users_status CHECK (acc_status IN ('ACTIVE', 'SUSPENDED', 'BANNED'))
);

-- 2) DRIVERS TABLE:

CREATE TABLE drivers (
  driver_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  license_num VARCHAR(50) NOT NULL,
  cnic VARCHAR(20) NOT NULL,
  verif_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  avail_status VARCHAR(20) NOT NULL DEFAULT 'OFFLINE',
  avg_rating DECIMAL(3,2) NOT NULL DEFAULT 0.00,
  total_trips INT UNSIGNED NOT NULL DEFAULT 0,
  wallet_balance DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  CONSTRAINT uk_drivers_user UNIQUE (user_id),
  CONSTRAINT uk_drivers_license UNIQUE (license_num),
  CONSTRAINT uk_drivers_cnic UNIQUE (cnic),
  CONSTRAINT fk_drivers_user
    FOREIGN KEY (user_id) REFERENCES users(user_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT chk_drivers_verif CHECK (verif_status IN ('PENDING', 'VERIFIED', 'REJECTED')),
  CONSTRAINT chk_drivers_avail CHECK (avail_status IN ('ONLINE', 'OFFLINE', 'ON_TRIP')),
  CONSTRAINT chk_drivers_avg_rating CHECK (avg_rating BETWEEN 0 AND 5),
  CONSTRAINT chk_drivers_total_trips CHECK (total_trips >= 0),
  CONSTRAINT chk_drivers_wallet_balance CHECK (wallet_balance >= 0)
);

-- 3) LOCATIONS TABLE:

CREATE TABLE locations (
  location_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  latitude DECIMAL(10,7) NOT NULL,
  longitude DECIMAL(10,7) NOT NULL,
  city VARCHAR(100) NOT NULL,
  address VARCHAR(255) NOT NULL,
  label VARCHAR(100) NULL,
  CONSTRAINT chk_locations_latitude CHECK (latitude BETWEEN -90 AND 90),
  CONSTRAINT chk_locations_longitude CHECK (longitude BETWEEN -180 AND 180)
);

-- 4) FARE RULES TABLE:

CREATE TABLE fare_rules (
  rule_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  vehicle_type VARCHAR(20) NOT NULL,
  base_rate DECIMAL(10,2) NOT NULL, -- total 10 digits 2 after decimal point 
  per_km_rate DECIMAL(10,2) NOT NULL,
  per_min_rate DECIMAL(10,2) NOT NULL,
  surge_multiplier DECIMAL(4,2) NOT NULL DEFAULT 1.00, -- so that it doesnt make values 0
  is_surge_active BOOLEAN NOT NULL DEFAULT 0,
  CONSTRAINT uk_fare_rules_vehicle_type UNIQUE (vehicle_type),
  CONSTRAINT chk_fare_vehicle_type CHECK (vehicle_type IN ('ECONOMY', 'PREMIUM', 'BIKE')),
  CONSTRAINT chk_fare_rules_rates
    CHECK (
      base_rate >= 0
      AND per_km_rate >= 0
      AND per_min_rate >= 0
      AND surge_multiplier >= 1.00
    )
);

-- 5) VEHICLES TABLE:

CREATE TABLE vehicles (
  vehicle_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  driver_id INT UNSIGNED NOT NULL,
  make VARCHAR(50) NOT NULL,
  model VARCHAR(50) NOT NULL,
  vehicle_year SMALLINT UNSIGNED NOT NULL,
  color VARCHAR(30) NOT NULL,
  license_plate VARCHAR(20) NOT NULL,
  vehicle_type VARCHAR(20) NOT NULL,
  verif_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  CONSTRAINT uk_vehicles_license_plate UNIQUE (license_plate),
  CONSTRAINT fk_vehicles_driver
    FOREIGN KEY (driver_id) REFERENCES drivers(driver_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT chk_vehicles_type CHECK (vehicle_type IN ('ECONOMY', 'PREMIUM', 'BIKE')),
  CONSTRAINT chk_vehicles_verif CHECK (verif_status IN ('PENDING', 'VERIFIED', 'REJECTED')),
  CONSTRAINT chk_vehicles_year CHECK (vehicle_year BETWEEN 1980 AND 2100)
);

-- 6) PROMO CODES TABLE:

CREATE TABLE promo_codes (
  promo_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(30) NOT NULL,
  discount_pct DECIMAL(5,2) NOT NULL,
  valid_until DATE NOT NULL,
  max_uses INT UNSIGNED NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT 1,
  CONSTRAINT uk_promo_codes_code UNIQUE (code),
  CONSTRAINT chk_promo_codes_discount CHECK (discount_pct > 0 AND discount_pct <= 100),
  CONSTRAINT chk_promo_codes_max_uses CHECK (max_uses > 0)
);

-- 7) RIDES TABLE:

CREATE TABLE rides (
  ride_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  rider_id INT UNSIGNED NOT NULL,
  driver_id INT UNSIGNED NOT NULL,
  vehicle_id INT UNSIGNED NOT NULL,
  pickup_loc_id INT UNSIGNED NOT NULL,
  dropoff_loc_id INT UNSIGNED NOT NULL,
  fare_rule_id INT UNSIGNED NOT NULL,
  requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  scheduled_at DATETIME NULL,
  duration_min INT UNSIGNED NOT NULL DEFAULT 0,
  distance_km DECIMAL(8,2) NOT NULL DEFAULT 0.00,
  ride_status VARCHAR(20) NOT NULL DEFAULT 'REQUESTED',
  fare DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  
  CONSTRAINT fk_rides_rider
    FOREIGN KEY (rider_id) REFERENCES users(user_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_rides_driver
    FOREIGN KEY (driver_id) REFERENCES drivers(driver_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_rides_vehicle
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(vehicle_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_rides_pickup
    FOREIGN KEY (pickup_loc_id) REFERENCES locations(location_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_rides_dropoff
    FOREIGN KEY (dropoff_loc_id) REFERENCES locations(location_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_rides_fare_rule
    FOREIGN KEY (fare_rule_id) REFERENCES fare_rules(rule_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
    
  CONSTRAINT chk_rides_status CHECK (ride_status IN ('REQUESTED', 'ACCEPTED', 'DRIVER_EN_ROUTE', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  CONSTRAINT chk_rides_duration CHECK (duration_min >= 0),
  CONSTRAINT chk_rides_distance CHECK (distance_km >= 0),
  CONSTRAINT chk_rides_fare CHECK (fare >= 0)
);

-- 8) PAYMENTS TABLE: 

CREATE TABLE payments (
  payment_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ride_id INT UNSIGNED NOT NULL,
  rider_id INT UNSIGNED NOT NULL,
  promo_id INT UNSIGNED NULL,
  payment_method VARCHAR(20) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  payment_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  txn_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  promo_discount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  
  CONSTRAINT uk_payments_ride UNIQUE (ride_id),
  CONSTRAINT fk_payments_ride
    FOREIGN KEY (ride_id) REFERENCES rides(ride_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_payments_rider
    FOREIGN KEY (rider_id) REFERENCES users(user_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_payments_promo
    FOREIGN KEY (promo_id) REFERENCES promo_codes(promo_id)
    ON UPDATE CASCADE ON DELETE SET NULL,
    
  CONSTRAINT chk_payments_method CHECK (payment_method IN ('CASH', 'WALLET', 'CARD')),
  CONSTRAINT chk_payments_status CHECK (payment_status IN ('PENDING', 'PAID', 'FAILED', 'REFUNDED')),
  CONSTRAINT chk_payments_amount CHECK (amount >= 0),
  CONSTRAINT chk_payments_discount CHECK (promo_discount >= 0)
);

-- 9) RATINGS TABLE:

CREATE TABLE ratings (
  rating_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ride_id INT UNSIGNED NOT NULL,
  rated_by INT UNSIGNED NOT NULL,
  rated_user INT UNSIGNED NOT NULL,
  score TINYINT UNSIGNED NOT NULL,
  comment TEXT NULL,
  rated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT uk_ratings_ride_rater UNIQUE (ride_id, rated_by),
  CONSTRAINT fk_ratings_ride
    FOREIGN KEY (ride_id) REFERENCES rides(ride_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_ratings_rated_by
    FOREIGN KEY (rated_by) REFERENCES users(user_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_ratings_rated_user
    FOREIGN KEY (rated_user) REFERENCES users(user_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
    
  CONSTRAINT chk_ratings_score CHECK (score BETWEEN 1 AND 5)
);

-- 10) COMPLAINTS TABLE:

CREATE TABLE complaints (
  complaint_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ride_id INT UNSIGNED NOT NULL,
  filed_by INT UNSIGNED NOT NULL,
  against_user INT UNSIGNED NOT NULL,
  description TEXT NOT NULL,
  comp_status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  filed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT fk_complaints_ride
    FOREIGN KEY (ride_id) REFERENCES rides(ride_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_complaints_filed_by
    FOREIGN KEY (filed_by) REFERENCES users(user_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_complaints_against_user
    FOREIGN KEY (against_user) REFERENCES users(user_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
    
  CONSTRAINT chk_comp_status CHECK (comp_status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'REJECTED'))
);

-- 11) DRIVER EARNINGS TABLE:

CREATE TABLE driver_earnings (
  earning_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ride_id INT UNSIGNED NOT NULL,
  driver_id INT UNSIGNED NOT NULL,
  gross_fare DECIMAL(10,2) NOT NULL,
  commission_pct DECIMAL(5,2) NOT NULL,
  net_earning DECIMAL(10,2) NOT NULL,
  earned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  payout_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  
  CONSTRAINT uk_driver_earnings_ride UNIQUE (ride_id),
  CONSTRAINT fk_driver_earnings_ride
    FOREIGN KEY (ride_id) REFERENCES rides(ride_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_driver_earnings_driver
    FOREIGN KEY (driver_id) REFERENCES drivers(driver_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
    
  CONSTRAINT chk_driver_earnings_payout CHECK (payout_status IN ('PENDING', 'PAID', 'HELD')),
  CONSTRAINT chk_driver_earnings_amounts
    CHECK (
      gross_fare >= 0
      AND commission_pct BETWEEN 0 AND 100
      AND net_earning >= 0
    )
);