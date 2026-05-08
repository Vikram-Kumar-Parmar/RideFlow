-- =====================================================================
-- D3 — Schema additions on top of D2.
-- Non-destructive ALTER TABLEs and one new table needed by D3 features.
-- Run AFTER 01_d2_base.sql (which DROPs and recreates the database).
-- Plain ALTER TABLEs work on both MySQL 8 and TiDB.
-- =====================================================================

USE databaseProject_db;

-- 1) usage_count on promo_codes — required by trg_promo_usage_increment.
ALTER TABLE promo_codes
  ADD COLUMN usage_count INT UNSIGNED NOT NULL DEFAULT 0;

-- 2) is_flagged on drivers — required by trg_driver_low_rating_flag.
ALTER TABLE drivers
  ADD COLUMN is_flagged BOOLEAN NOT NULL DEFAULT 0;

-- 3) wallet_balance on users — riders need a wallet (drivers have their own).
ALTER TABLE users
  ADD COLUMN wallet_balance DECIMAL(12,2) NOT NULL DEFAULT 0.00;

-- 4) admin_notifications — written to by the low-rating trigger.
CREATE TABLE IF NOT EXISTS admin_notifications (
  notification_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  message VARCHAR(500) NOT NULL,
  related_user_id INT UNSIGNED NULL,
  is_read BOOLEAN NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_admin_notifications_user
    FOREIGN KEY (related_user_id) REFERENCES users(user_id)
    ON UPDATE CASCADE ON DELETE SET NULL
);
