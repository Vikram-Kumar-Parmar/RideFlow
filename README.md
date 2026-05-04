# RideFlow — Database Systems D3

A ride-hailing platform built on top of the D2 relational schema.

> **Author:** Vikram Kumar | Roll: **23K-2062** | Section: **DS-4B**

## What's included

- **Backend:** Node.js + Express + `mysql2/promise`.
- **Frontend:** Vanilla HTML / CSS / JS — Rider, Driver, and Admin dashboards with role-based login.
- **Database:** MySQL 8 *or* TiDB Cloud (the connection layer auto-switches via `DB_TARGET` in `.env`).

### D3 deliverables checked off

| Rubric item | File |
|---|---|
| Views: `ActiveRidesView`, `TopDriversView` | `schema/03_d3_views_indexes.sql` |
| Indexes on `rider_id`, `driver_id`, `ride_status`, `city` | `schema/03_d3_views_indexes.sql` |
| Stored procedure `sp_calculate_fare` (base + per-km + per-min × surge) | `schema/04_d3_procedures.sql` |
| Trigger — payment PAID → ride COMPLETED | `schema/05_d3_triggers.sql` |
| Trigger — driver avg_rating < 3.5 → flag + admin notification | `schema/05_d3_triggers.sql` |
| Trigger — promo applied → increment `promo_codes.usage_count` | `schema/05_d3_triggers.sql` |
| Event — every midnight, expire promos past `valid_until` | `schema/06_d3_events.sql` |
| DCL — `driver_role`, `rider_role`, `support_role`, `admin_role` | `schema/07_d3_dcl.sql` |
| All 8 rubric SQL queries (basic / aggregate / HAVING / INNER / LEFT / promo) | `backend/routes/admin.js` |
| Rider, Driver, Admin dashboards (role-based) | `frontend/{rider,driver,admin}.html` |
| Static branding footer on every page | every HTML page |

## TiDB Cloud (+5 bonus)

Set `DB_TARGET=tidb` and fill `TIDB_*` in `.env`. The setup script will skip `04`/`05`/`06`/`07` (procedures/triggers/events/roles) since [TiDB does not support those features](https://docs.pingcap.com/tidb/stable/mysql-compatibility/#unsupported-features). The same logic is enforced in the application layer (see `backend/routes/rider.js` and `driver.js`), so the app works against either DB.

For full marks on the trigger/procedure/event/DCL rubric items, run the demo against local MySQL using the same codebase. (This is the recommended hybrid approach.)

## Running it

```bash
# 1. install
npm install

# 2. configure
cp .env.example .env
# edit .env: set MYSQL_PASSWORD (or TIDB_*), JWT_SECRET, etc.

# 3. set up the schema + seed data
npm run db:setup

# 4. start the server
npm start
# open http://localhost:3000
```

### Demo logins (password = `password` for all)

| Role | Email |
|---|---|
| Admin | `admin@demo.com` |
| Rider | `rider@demo.com` |
| Driver | `driver@demo.com` |

## Project layout

```
RideFlow/
├── PLAN.md                 # architectural plan
├── README.md
├── package.json
├── .env.example
├── schema/
│   ├── 01_d2_base.sql      # the D2 schema, untouched
│   ├── 02_d3_additions.sql # ALTER TABLE + admin_notifications table
│   ├── 03_d3_views_indexes.sql
│   ├── 04_d3_procedures.sql
│   ├── 05_d3_triggers.sql
│   ├── 06_d3_events.sql
│   ├── 07_d3_dcl.sql
│   └── 99_seed.sql
├── backend/
│   ├── server.js
│   ├── db.js               # mysql2 pool, picks MYSQL or TIDB
│   ├── middleware/auth.js
│   ├── routes/{auth,rider,driver,admin,lookups}.js
│   └── scripts/setup-db.js
└── frontend/
    ├── index.html  login.html  register.html
    ├── rider.html  driver.html admin.html
    ├── css/style.css
    └── js/{api,rider,driver,admin}.js
```

## Notes on schema additions (D3 only)

The D2 schema didn't include some columns the D3 features require, so `02_d3_additions.sql` adds them non-destructively:

- `promo_codes.usage_count` — incremented by the promo trigger.
- `drivers.is_flagged` — set by the low-rating trigger.
- `users.wallet_balance` — riders' wallet balance (drivers have their own on `drivers`).
- New table `admin_notifications` — written by the low-rating trigger.

D2 is left as-is.
