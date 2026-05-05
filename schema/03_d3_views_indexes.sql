-- =====================================================================
-- D3 — Views & Indexes (rubric requirement)
-- Compatible with MySQL 8 and TiDB.
-- =====================================================================

USE databaseProject_db;

-- ---------- VIEWS ----------------------------------------------------

-- ActiveRidesView — ongoing trips with full rider and driver details.
DROP VIEW IF EXISTS ActiveRidesView;
CREATE VIEW ActiveRidesView AS
SELECT
  r.ride_id,
  r.ride_status,
  r.requested_at,
  r.distance_km,
  r.duration_min,
  r.fare,
  rider.user_id    AS rider_id,
  rider.full_name  AS rider_name,
  rider.phone      AS rider_phone,
  d.driver_id,
  duser.full_name  AS driver_name,
  duser.phone      AS driver_phone,
  d.avg_rating     AS driver_rating,
  v.vehicle_id,
  v.make           AS vehicle_make,
  v.model          AS vehicle_model,
  v.license_plate,
  v.vehicle_type,
  pl.city          AS pickup_city,
  pl.address       AS pickup_address,
  dl.city          AS dropoff_city,
  dl.address       AS dropoff_address
FROM rides r
JOIN users     rider ON rider.user_id = r.rider_id
JOIN drivers   d     ON d.driver_id   = r.driver_id
JOIN users     duser ON duser.user_id = d.user_id
JOIN vehicles  v     ON v.vehicle_id  = r.vehicle_id
JOIN locations pl    ON pl.location_id = r.pickup_loc_id
JOIN locations dl    ON dl.location_id = r.dropoff_loc_id
WHERE r.ride_status IN ('REQUESTED', 'ACCEPTED', 'DRIVER_EN_ROUTE', 'IN_PROGRESS');

-- TopDriversView — drivers with avg rating > 4.5.
DROP VIEW IF EXISTS TopDriversView;
CREATE VIEW TopDriversView AS
SELECT
  d.driver_id,
  u.full_name      AS driver_name,
  u.email,
  u.phone,
  d.avg_rating,
  d.total_trips,
  d.avail_status,
  d.verif_status
FROM drivers d
JOIN users   u ON u.user_id = d.user_id
WHERE d.avg_rating > 4.5
ORDER BY d.avg_rating DESC, d.total_trips DESC;

-- ---------- INDEXES --------------------------------------------------
-- 01_d2_base.sql DROPs and recreates the database, so plain CREATE INDEX
-- statements are always safe; both MySQL 8 and TiDB accept them.

CREATE INDEX idx_rides_rider_id  ON rides(rider_id);
CREATE INDEX idx_rides_driver_id ON rides(driver_id);
CREATE INDEX idx_rides_status    ON rides(ride_status);
CREATE INDEX idx_locations_city  ON locations(city);
