-- =====================================================================
-- D3 — Events (MySQL only — TiDB does not support events)
-- =====================================================================

SET GLOBAL event_scheduler = ON;

USE databaseProject_db;

-- ev_expire_promo_codes — runs every night at 00:00 and deactivates
-- promo codes whose valid_until has passed.
DROP EVENT IF EXISTS ev_expire_promo_codes;
DELIMITER //
CREATE EVENT ev_expire_promo_codes
ON SCHEDULE EVERY 1 DAY
  STARTS (TIMESTAMP(CURRENT_DATE) + INTERVAL 1 DAY)
DO
BEGIN
  UPDATE promo_codes
     SET is_active = 0
   WHERE valid_until < CURDATE()
     AND is_active = 1;
END//
DELIMITER ;
