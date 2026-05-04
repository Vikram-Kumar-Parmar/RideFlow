-- =====================================================================
-- D3 — Schema additions on top of D2.
-- Non-destructive ALTER TABLEs and one new table needed by D3 features.
-- Run AFTER 01_d2_base.sql.
-- Idempotent: safe to run multiple times on MySQL 8 (no IF NOT EXISTS
-- support for ADD COLUMN), so we wrap each addition in a small helper.
-- =====================================================================

USE databaseProject_db;

DROP PROCEDURE IF EXISTS _d3_add_column_if_missing;
DELIMITER //
CREATE PROCEDURE _d3_add_column_if_missing(
  IN p_table   VARCHAR(64),
  IN p_column  VARCHAR(64),
  IN p_def     VARCHAR(255)
)
BEGIN
  DECLARE c INT DEFAULT 0;
  SELECT COUNT(*) INTO c
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name   = p_table
    AND column_name  = p_column;
  IF c = 0 THEN
    SET @s = CONCAT('ALTER TABLE ', p_table, ' ADD COLUMN ', p_column, ' ', p_def);
    PREPARE st FROM @s;
    EXECUTE st;
    DEALLOCATE PREPARE st;
  END IF;
END//
DELIMITER ;

-- 1) usage_count on promo_codes — required by trg_promo_usage_increment
CALL _d3_add_column_if_missing(
  'promo_codes', 'usage_count',
  'INT UNSIGNED NOT NULL DEFAULT 0'
);

-- 2) is_flagged on drivers — required by trg_driver_low_rating_flag
CALL _d3_add_column_if_missing(
  'drivers', 'is_flagged',
  'BOOLEAN NOT NULL DEFAULT 0'
);

-- 3) wallet_balance on users — riders need a wallet (drivers have their own)
CALL _d3_add_column_if_missing(
  'users', 'wallet_balance',
  'DECIMAL(12,2) NOT NULL DEFAULT 0.00'
);

DROP PROCEDURE IF EXISTS _d3_add_column_if_missing;

-- 4) admin_notifications — written to by the low-rating trigger
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
