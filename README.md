# RideFlow

A multi-role ride-hailing platform built for the Database Systems course
(Deliverable 3). RideFlow ships a fully-typed relational schema, a Node.js +
Express backend, three role-scoped dashboards, and the full set of advanced
database objects (views, indexes, stored procedure, triggers, scheduled event,
and access-control roles).

## Team
/
| Name          | Roll No   | Section |
|---------------|-----------|---------|
| Vikram Kumar  | 23K-2062  | DS-4B   |
| Umar Behram   | 23I-2604  | DS-4B   |

## Quick links

- Architecture, schema listings and screenshots: [`report/RideFlow_D3_Report.pdf`](report/RideFlow_D3_Report.pdf)
- Editable report source: [`report/report.html`](report/report.html)
- Viva preparation keybook: [`docs/KEYBOOK.md`](docs/KEYBOOK.md)
- ER diagram (auto-generated): [`report/erd.png`](report/erd.png)
- Deployment guide: [`DEPLOY.md`](DEPLOY.md)
- **Live URL**: [https://rideflow-tau.vercel.app](https://rideflow-tau.vercel.app) (deployed on Vercel, backed by TiDB Cloud)

## Project layout

```
RideFlow/
├── README.md
├── DEPLOY.md
├── package.json
├── .env.example
├── Dockerfile  Procfile  fly.toml  render.yaml
├── docs/
│   └── KEYBOOK.md            # viva questions, working flow, key concepts
├── schema/
│   ├── 01_d2_base.sql        # D2 base schema (kept untouched)
│   ├── 02_d3_additions.sql   # ALTER TABLE + admin_notifications
│   ├── 03_d3_views_indexes.sql
│   ├── 04_d3_procedures.sql  # MySQL only
│   ├── 05_d3_triggers.sql    # MySQL only
│   ├── 06_d3_events.sql      # MySQL only
│   ├── 07_d3_dcl.sql         # MySQL only
│   └── 99_seed.sql
├── backend/
│   ├── server.js
│   ├── db.js                 # mysql2 pool, MySQL or TiDB target
│   ├── middleware/auth.js
│   ├── routes/{auth,rider,driver,admin,lookups}.js
│   └── scripts/setup-db.js
├── frontend/
│   ├── index.html  login.html  register.html
│   ├── rider.html  driver.html admin.html
│   ├── css/style.css
│   └── js/{api,rider,driver,admin}.js
└── report/
    ├── RideFlow_D3_Report.pdf
    ├── RideFlow_D3_Report.docx
    ├── report.html  erd.png
    └── shots/                # UI screenshots embedded in the report
```

## Tech stack

| Layer    | Technology                             |
|----------|----------------------------------------|
| Database | MySQL 8 (primary) or TiDB Cloud (bonus)|
| Backend  | Node.js 20+, Express, mysql2/promise   |
| Frontend | Vanilla HTML, CSS and JavaScript       |
| Auth     | bcrypt password hash + JWT (HS256)     |

## D3 deliverables

| Rubric item | File / object |
|---|---|
| Views: `ActiveRidesView`, `TopDriversView` | `schema/03_d3_views_indexes.sql` |
| Indexes on `rider_id`, `driver_id`, `ride_status`, `city` | `schema/03_d3_views_indexes.sql` |
| Stored procedure — fare = base + per-km + per-min × surge | `schema/04_d3_procedures.sql` (`sp_calculate_fare`) |
| Trigger — payment PAID → ride COMPLETED | `schema/05_d3_triggers.sql` (`trg_payment_paid_complete_ride`) |
| Trigger — driver flag + admin notification when avg < 3.5 | `schema/05_d3_triggers.sql` (`trg_driver_low_rating_flag`) |
| Trigger — increment `promo_codes.usage_count` on use | `schema/05_d3_triggers.sql` (`trg_promo_usage_increment`) |
| Event — nightly expiry of expired promos | `schema/06_d3_events.sql` (`ev_expire_promo_codes`) |
| DCL — `driver_role`, `rider_role`, `support_role`, `admin_role` | `schema/07_d3_dcl.sql` |
| 8 reporting queries (basic / aggregate / HAVING / INNER / LEFT / promo) | `backend/routes/admin.js` |
| Rider, Driver, Admin dashboards with role-based login | `frontend/{rider,driver,admin}.html` |
| Static team-members footer on every page | every HTML page |

## TiDB Cloud (bonus)

The same codebase runs against TiDB Cloud by setting `DB_TARGET=tidb` and
filling the `TIDB_*` variables in `.env`. TiDB does not support stored
procedures, triggers, or events, so the schema setup auto-skips
`04`..`07` on that target. The application reproduces the same behavior
at the application layer (fare math, promo `usage_count++`, low-rating
flagging, payment-completion). The MySQL-only objects in `04`..`07` are
still committed and run unchanged on a local MySQL 8 — that is how the
rubric-required SQL objects are demonstrated.

## Running locally (MySQL)

```bash
git clone https://github.com/Vikram-Kumar-Parmar/RideFlow.git
cd RideFlow
cp .env.example .env       # set DB_TARGET=mysql, MYSQL_*, JWT_SECRET
npm install
npm run db:setup           # applies 01..07 + seed data
npm start                  # http://localhost:3000
```

## Running on TiDB Cloud

```bash
cp .env.example .env       # set DB_TARGET=tidb, TIDB_*, TIDB_SSL_CA, JWT_SECRET
npm install
npm run db:setup           # 04..07 auto-skipped (TiDB-incompatible)
npm start
```

The bundled `Dockerfile`, `Procfile`, `render.yaml`, and `fly.toml` are
ready for a containerised or PaaS deploy. See [`DEPLOY.md`](DEPLOY.md) for
full instructions on Render, Fly.io, and any Docker host.

## Demo logins

Every account uses the password **`password`**.

| Role   | Email             |
|--------|-------------------|
| Admin  | admin@demo.com    |
| Rider  | rider@demo.com    |
| Driver | driver@demo.com   |

## Schema additions for D3

The D2 base schema did not include four objects required by the D3 triggers
and rider features, so `02_d3_additions.sql` adds them non-destructively:

- `promo_codes.usage_count` — incremented by the promo trigger.
- `drivers.is_flagged` — set by the low-rating trigger.
- `users.wallet_balance` — riders' wallet balance.
- New table `admin_notifications` — written by the low-rating trigger.

`01_d2_base.sql` is left exactly as it was submitted in D2.
