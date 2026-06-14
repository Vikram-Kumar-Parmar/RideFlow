-- =====================================================================
-- D3 — Rider Low-Rating Flag Trigger (MySQL only)
-- Flags a rider and sends an admin notification when their average
-- rating (given by drivers) falls below 3.0.
-- Run AFTER 02_d3_additions.sql (which adds users.is_flagged).
-- =====================================================================

USE databaseProject_db;

-- Fires AFTER a rating row is inserted, checks the rated user's role.
-- If the rated user is a RIDER and their new avg < 3.0, flag them.
DROP TRIGGER IF EXISTS trg_rider_low_rating_flag;
DELIMITER //
CREATE TRIGGER trg_rider_low_rating_flag
AFTER INSERT ON ratings
FOR EACH ROW
BEGIN
  DECLARE v_role     VARCHAR(20);
  DECLARE v_avg      DECIMAL(5,2);
  DECLARE v_flagged  TINYINT;

  -- Only process if we are rating a rider.
  SELECT role, is_flagged
    INTO v_role, v_flagged
    FROM users
   WHERE user_id = NEW.rated_user;

  IF v_role = 'RIDER' AND v_flagged = 0 THEN
    SELECT IFNULL(AVG(score), 0)
      INTO v_avg
      FROM ratings
     WHERE rated_user = NEW.rated_user;

    IF v_avg < 3.00 THEN
      UPDATE users SET is_flagged = 1 WHERE user_id = NEW.rated_user;
      INSERT INTO admin_notifications (message, related_user_id)
      VALUES (
        CONCAT('Rider #', NEW.rated_user,
               ' flagged for low average rating (',
               FORMAT(v_avg, 2), ').'),
        NEW.rated_user
      );
    END IF;
  END IF;
END//
DELIMITER ;
