# RideFlow — Deliverable 3 Architectural Plan

**Author:** Vikram Kumar | Roll: 23K-2062 | Section: DS-4B
**Backend:** Node.js + Express + `mysql2/promise`
**Database:** MySQL 8.x (or TiDB Cloud — see warning below)
**Frontend:** Vanilla HTML / CSS / JavaScript (no build step), served as static files by Express
**Auth:** JWT (HS256) stored in `localStorage`; role read from `users.role`

---

## CRITICAL WARNING — TiDB Cloud +5 Bonus vs. Triggers/Procedures/Events

The D3 rubric requires **stored procedures, triggers, and events**. **TiDB does NOT support these features natively** ([TiDB compatibility docs](https://docs.pingcap.com/tidb/stable/mysql-compatibility/#unsupported-features)). Specifically TiDB does not support: stored procedures and functions, triggers, events.

You have three options — please pick one:

| Option | Bonus (+5) | Triggers/Procs/Events marks |
|---|---|---|
| **A. Local MySQL only** | Forfeit | Full marks |
| **B. TiDB Cloud only** | Earn +5 | Lose those marks (or move logic to app layer) |
| **C. Hybrid (recommended for max marks)** | Earn +5 | Full marks |

**Option C — Hybrid (my recommendation):** Keep the **demonstrable** triggers/procedures/events as a working DDL script you can run against any local MySQL/MariaDB instance for the demo. Run the **live application** against TiDB Cloud for the bonus. Document in the report that TiDB enforces the same logic in the app layer. This way you get every mark on the rubric.

**My default plan: I'll build for Option C** — code works against either, the `.env` has both `MYSQL_*` and `TIDB_*` block, and `npm run db:setup-mysql` and `npm run db:setup-tidb` exist as separate scripts.

If you want a different option, tell me.

---

## High-Level Architecture

```
┌──────────────────────────────────────────────────┐
│  Browser (Rider / Driver / Admin dashboards)    │
│  - login.html, rider.html, driver.html,         │
│    admin.html  +  shared footer                 │
└───────────────────┬──────────────────────────────┘
                    │ fetch() + JWT
                    ▼
┌──────────────────────────────────────────────────┐
│  Express server (backend/server.js)             │
│  - /api/auth/* (login, register)                │
│  - /api/rider/* (book, history, wallet, rate)   │
│  - /api/driver/* (availability, queue, accept,  │
│    reject, earnings)                            │
│  - /api/admin/* (users, vehicles, fare rules,   │
│    reports)                                     │
│  - /api/lookups/* (locations, promo codes)      │
│  - middleware/auth.js (JWT + role guard)        │
└───────────────────┬──────────────────────────────┘
                    │ mysql2/promise pool
                    ▼
┌──────────────────────────────────────────────────┐
│  MySQL 8 (local) or TiDB Cloud                  │
│  D2 base schema (11 tables) + D3 additions:     │
│  - 2 views, 4 indexes, 1 procedure,             │
│    3 triggers, 1 event, DCL grants              │
└──────────────────────────────────────────────────┘
```

---

## D2 Schema Recap (already provided)

Tables: `users`, `drivers`, `locations`, `fare_rules`, `vehicles`, `promo_codes`, `rides`, `payments`, `ratings`, `complaints`, `driver_earnings`.

Key joins for D3:
- `rides.rider_id` → `users.user_id`
- `rides.driver_id` → `drivers.driver_id` (NOT `users.user_id`)
- Driver's name: `drivers JOIN users ON drivers.user_id = users.user_id`
- City: `rides.pickup_loc_id` → `locations.location_id` → `locations.city`

---

## Schema Extensions Needed for D3 (in `schema/02_d3_additions.sql`)

The D2 schema is missing a few columns that D3 features require. Adding them as additive `ALTER TABLE` statements (D2 stays untouched):

1. `promo_codes.usage_count INT UNSIGNED NOT NULL DEFAULT 0` — for the trigger that increments on each use.
2. `drivers.is_flagged BOOLEAN NOT NULL DEFAULT 0` — for the trigger that flags drivers below 3.5 avg rating.
3. New table `admin_notifications` (notification_id, message, related_user_id, created_at, is_read) — what the flag trigger writes into.
4. `users.wallet_balance DECIMAL(12,2) NOT NULL DEFAULT 0.00` — so riders can manage wallet from their dashboard. (`drivers.wallet_balance` already exists for driver earnings.)

I'll call this out explicitly in the D3 report so the markers see it's intentional.

---

## D3 Database Objects (rubric coverage)

### Views
- `ActiveRidesView` — ongoing trips with rider name, driver name, vehicle, pickup/dropoff city, status. Status filter: `('REQUESTED','ACCEPTED','DRIVER_EN_ROUTE','IN_PROGRESS')`.
- `TopDriversView` — drivers with `avg_rating > 4.5`, joined to `users` for the driver's name and to `vehicles` for their car.

### Indexes
- `idx_rides_rider_id ON rides(rider_id)`
- `idx_rides_driver_id ON rides(driver_id)`
- `idx_rides_status ON rides(ride_status)`
- `idx_locations_city ON locations(city)`

### Stored Procedure
- `sp_calculate_fare(IN p_ride_id, IN p_is_peak, OUT p_fare)` — looks up `base_rate`, `per_km_rate`, `per_min_rate`, `surge_multiplier` from `fare_rules` joined via the ride's `fare_rule_id`. Computes `(base + per_km * distance + per_min * duration) * (peak ? surge : 1)` and writes result into `rides.fare`. Returns final fare via OUT param.

### Triggers
- `trg_payment_paid_complete_ride` — `AFTER UPDATE ON payments` — when `payment_status` flips from anything to `'PAID'`, set `rides.ride_status = 'COMPLETED'`.
- `trg_driver_low_rating_flag` — `AFTER UPDATE ON drivers` — when `avg_rating < 3.5`, set `drivers.is_flagged = 1` and insert a row into `admin_notifications`.
- `trg_promo_usage_increment` — `AFTER INSERT ON payments` — when `promo_id IS NOT NULL`, increment `promo_codes.usage_count`. (The procedure that creates a payment is the "applied to a ride" event.)

### Event
- `ev_expire_promo_codes` — `EVERY 1 DAY STARTS CURRENT_DATE + INTERVAL 1 DAY` — runs at midnight; sets `promo_codes.is_active = 0` where `valid_until < CURDATE()`. Plus `SET GLOBAL event_scheduler = ON;` at the top of the script.

### DCL
```sql
CREATE ROLE IF NOT EXISTS driver_role, rider_role, support_role, admin_role;
GRANT SELECT ON databaseProject_db.rides TO driver_role;
GRANT INSERT, SELECT ON databaseProject_db.rides TO rider_role;
GRANT INSERT, SELECT ON databaseProject_db.payments TO rider_role;
REVOKE DELETE ON databaseProject_db.* FROM support_role;
GRANT ALL PRIVILEGES ON databaseProject_db.* TO admin_role WITH GRANT OPTION;
```

(Roles are created idempotently. The application connects as a single application user that has the union of needed privileges; the role grants are kept as part of the deliverable to demonstrate the rubric requirement, and a comment explains how to log in as each role for the demo.)

---

## Backend API Endpoints (Step 3)

### Auth
- `POST /api/auth/register` — body `{full_name, email, phone, password, role}`.
- `POST /api/auth/login` — returns JWT + role.

### Rider
- `POST /api/rider/rides` — body `{pickup_loc_id, dropoff_loc_id, vehicle_type, distance_km, duration_min, is_peak, promo_code?}`. Inserts ride (status `REQUESTED`), inserts payment row (status `PENDING`), runs `sp_calculate_fare`.
- `GET /api/rider/rides` — full ride history.
- `GET /api/rider/wallet`, `POST /api/rider/wallet/topup`.
- `POST /api/rider/ratings` — body `{ride_id, rated_user, score, comment}`.

### Driver
- `PUT /api/driver/availability` — body `{avail_status}`.
- `GET /api/driver/incoming` — rides in `REQUESTED` matching driver's online status (only Online drivers see queue per rubric).
- `POST /api/driver/rides/:id/accept`, `POST /api/driver/rides/:id/reject`.
- `GET /api/driver/earnings`, `GET /api/driver/history`.

### Admin
- `GET /api/admin/users`, `PUT /api/admin/users/:id/status`.
- `GET /api/admin/vehicles`, `PUT /api/admin/vehicles/:id/verify`.
- `GET /api/admin/fare-rules`, `PUT /api/admin/fare-rules/:id`.
- Reports (these are the **rubric-required SQL queries**):
  - `GET /api/admin/reports/completed-rides?rider_id=…` — ORDER BY date.
  - `GET /api/admin/reports/drivers-by-city?city=…` — ORDER BY rating DESC.
  - `GET /api/admin/reports/revenue-per-city` — `SUM(amount) GROUP BY city`.
  - `GET /api/admin/reports/trips-per-driver` — `COUNT(*) GROUP BY driver_id`.
  - `GET /api/admin/reports/low-rated-drivers` — `AVG(score) HAVING AVG(score) < 3.5` from `ratings`.
  - `GET /api/admin/reports/full-trip-report` — INNER JOIN riders/rides/drivers/vehicles.
  - `GET /api/admin/reports/all-riders-with-rides` — LEFT JOIN so riders with 0 rides appear.
  - `GET /api/admin/reports/promo-discount-usage` — JOIN payments and promo_codes.

### Lookups
- `GET /api/lookups/locations`, `GET /api/lookups/promo-codes/active`.

All routes guarded by `requireAuth` + `requireRole(['rider'])` etc.

---

## Frontend Pages (Step 4)

```
frontend/
├── index.html              # redirects based on role
├── login.html              # role-based login (rider | driver | admin)
├── register.html
├── rider.html              # 4 tabs: Book Ride · Ride History · Wallet · My Ratings
├── driver.html             # 4 tabs: Availability toggle · Incoming queue · Earnings · Trip history
├── admin.html              # 4 tabs: Users & Vehicles · Fare rules · Reports & analytics · Notifications
├── css/style.css
└── js/
    ├── api.js              # fetch wrapper that injects JWT
    ├── auth.js
    ├── rider.js
    ├── driver.js
    └── admin.js
```

**Footer (on every page):** `Developed by Vikram Kumar | Roll: 23K-2062 | Section: DS-4B`

No hardcoded data. Every list/table is populated from a `fetch('/api/…')` call.

---

## Project Layout

```
RideFlow/
├── PLAN.md                          # this file
├── README.md                        # how to run
├── package.json
├── .env.example                     # MYSQL_* and TIDB_* blocks
├── schema/
│   ├── 01_d2_base.sql               # your D2 schema, copied verbatim
│   ├── 02_d3_additions.sql          # ALTER TABLE adds + admin_notifications
│   ├── 03_d3_views_indexes.sql
│   ├── 04_d3_procedures.sql
│   ├── 05_d3_triggers.sql
│   ├── 06_d3_events.sql
│   ├── 07_d3_dcl.sql
│   └── 99_seed.sql                  # demo data so dashboards aren't empty
├── backend/
│   ├── server.js
│   ├── db.js                        # mysql2 pool, MYSQL or TIDB based on env
│   ├── middleware/auth.js
│   └── routes/
│       ├── auth.js
│       ├── rider.js
│       ├── driver.js
│       ├── admin.js
│       └── lookups.js
└── frontend/
    └── (as above)
```

---

## Run Steps (for the demo)

```bash
# 1. install
npm install

# 2. configure
cp .env.example .env
# fill in MYSQL_* (or TIDB_*) and JWT_SECRET

# 3. set up DB (runs all 8 SQL files in order)
npm run db:setup

# 4. start
npm run dev
# → http://localhost:3000
```

Test logins (seeded):
- Rider: `rider@demo.com` / `password`
- Driver: `driver@demo.com` / `password`
- Admin: `admin@demo.com` / `password`

---

## Open Questions for You

1. **TiDB option (A / B / C)?** I'm defaulting to **C (hybrid)** unless you say otherwise.
2. **TiDB credentials** — do you want me to start now with local MySQL only, or do you have your TiDB Cloud connection string ready?
3. **Anything in the D3 PDF I'm missing?** I built this plan from the rubric points in your prompt. If you can attach `DB_Project_AI&DS.pdf` (instructions) and the rubric PDF, I'll cross-check against them before coding.

I'll start coding the backend skeleton + schema files now in parallel so we don't lose time. Reply to confirm Option A/B/C and I'll wire up the connection accordingly.
