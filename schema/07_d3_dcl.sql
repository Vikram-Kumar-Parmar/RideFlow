-- =====================================================================
-- D3 — DCL (Roles & Privileges)
-- Demonstrates role-based access control as required by the rubric.
-- Roles are created idempotently; the rubric grants/revokes are applied.
-- (The application connects as a single user that has the union of
--  these privileges; per-role demo logins are documented in README.)
-- =====================================================================

CREATE ROLE IF NOT EXISTS 'driver_role';
CREATE ROLE IF NOT EXISTS 'rider_role';
CREATE ROLE IF NOT EXISTS 'support_role';
CREATE ROLE IF NOT EXISTS 'admin_role';

-- Drivers can read the rides table.
GRANT SELECT ON databaseProject_db.rides TO 'driver_role';

-- Riders can insert and read rides + payments.
GRANT INSERT, SELECT ON databaseProject_db.rides    TO 'rider_role';
GRANT INSERT, SELECT ON databaseProject_db.payments TO 'rider_role';

-- Support team must NOT delete data — first grant SELECT/UPDATE so the
-- REVOKE DELETE has something to revoke from, then revoke.
GRANT SELECT, UPDATE ON databaseProject_db.* TO 'support_role';
REVOKE DELETE         ON databaseProject_db.* FROM 'support_role';

-- Admin gets full privileges across all tables.
GRANT ALL PRIVILEGES ON databaseProject_db.* TO 'admin_role' WITH GRANT OPTION;

FLUSH PRIVILEGES;
