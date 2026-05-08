-- =====================================================================
-- D3 — Triggers (MySQL only — TiDB does not support triggers)
-- =====================================================================

USE databaseProject_db;

-- 1) When a payment is marked PAID, complete the associated ride.
DROP TRIGGER IF EXISTS trg_payment_paid_complete_ride;
DELIMITER //
CREATE TRIGGER trg_payment_paid_complete_ride
AFTER UPDATE ON payments
FOR EACH ROW
BEGIN
  IF NEW.payment_status = 'PAID' AND OLD.payment_status <> 'PAID' THEN
    UPDATE rides
       SET ride_status = 'COMPLETED'
     WHERE ride_id = NEW.ride_id;
  END IF;
END//
DELIMITER ;

-- 2) Flag a driver and notify admin if avg rating drops below 3.5.
--    Implemented as a BEFORE UPDATE trigger so it can mutate NEW.is_flagged
--    in-place (a trigger cannot UPDATE the same table that fires it).
DROP TRIGGER IF EXISTS trg_driver_low_rating_flag;
DELIMITER //
CREATE TRIGGER trg_driver_low_rating_flag
BEFORE UPDATE ON drivers
FOR EACH ROW
BEGIN
  IF NEW.avg_rating < 3.50 AND OLD.is_flagged = 0 THEN
    SET NEW.is_flagged = 1;
    INSERT INTO admin_notifications (message, related_user_id)
    VALUES (
      CONCAT('Driver #', NEW.driver_id,
             ' flagged for low average rating (',
             FORMAT(NEW.avg_rating, 2), ').'),
      NEW.user_id
    );
  END IF;
END//
DELIMITER ;

-- 3) Increment a promo code's usage_count whenever a ride applies it
--    (a payment row is the artefact of "promo applied to a ride").
DROP TRIGGER IF EXISTS trg_promo_usage_increment;
DELIMITER //
CREATE TRIGGER trg_promo_usage_increment
AFTER INSERT ON payments
FOR EACH ROW
BEGIN
  IF NEW.promo_id IS NOT NULL THEN
    UPDATE promo_codes
       SET usage_count = usage_count + 1
     WHERE promo_id = NEW.promo_id;
  END IF;
END//
DELIMITER ;
