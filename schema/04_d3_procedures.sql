-- =====================================================================
-- D3 — Stored Procedure (MySQL only — TiDB does not support procedures)
-- Skipped automatically by the setup script when DB_TARGET=tidb.
-- =====================================================================

USE databaseProject_db;

-- sp_calculate_fare
--   Auto-calculates a ride's fare using the fare rules table:
--   fare = (base_rate + per_km_rate * distance_km + per_min_rate * duration_min)
--          * (CASE WHEN p_is_peak THEN surge_multiplier ELSE 1 END)
--   Writes the fare back into rides.fare and returns it via OUT.
-- ---------------------------------------------------------------------

DROP PROCEDURE IF EXISTS sp_calculate_fare;
DELIMITER //
CREATE PROCEDURE sp_calculate_fare(
  IN  p_ride_id  INT UNSIGNED,
  IN  p_is_peak  BOOLEAN,
  OUT p_fare     DECIMAL(10,2)
)
BEGIN
  DECLARE v_base    DECIMAL(10,2);
  DECLARE v_km_rate DECIMAL(10,2);
  DECLARE v_min_rate DECIMAL(10,2);
  DECLARE v_surge   DECIMAL(4,2);
  DECLARE v_dist    DECIMAL(8,2);
  DECLARE v_dur     INT UNSIGNED;
  DECLARE v_mult    DECIMAL(4,2);

  SELECT fr.base_rate, fr.per_km_rate, fr.per_min_rate, fr.surge_multiplier,
         r.distance_km, r.duration_min
    INTO v_base, v_km_rate, v_min_rate, v_surge, v_dist, v_dur
  FROM rides r
  JOIN fare_rules fr ON fr.rule_id = r.fare_rule_id
  WHERE r.ride_id = p_ride_id;

  SET v_mult = CASE WHEN p_is_peak THEN v_surge ELSE 1.00 END;

  SET p_fare = ROUND(
    (v_base + v_km_rate * v_dist + v_min_rate * v_dur) * v_mult,
    2
  );

  UPDATE rides SET fare = p_fare WHERE ride_id = p_ride_id;
END//
DELIMITER ;
