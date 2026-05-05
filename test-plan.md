# RideFlow D3 — Test Plan

**PR:** https://github.com/Vikram-Kumar-Parmar/RideFlow/pull/1
**Goal:** prove the D3 rubric features work end-to-end through the UI: stored procedure calculates fares, the three triggers fire, the views populate, and the admin reports use the right SQL.

## What changed (user-visible)
A complete ride-hailing UI on top of the D2 schema with three role-based dashboards. The DB layer adds `ActiveRidesView`, `TopDriversView`, `sp_calculate_fare`, three triggers, a nightly event, and DCL roles.

## One primary end-to-end flow
A single chained scenario covers the rubric. The same sequence would look visibly broken if any one piece is wrong:

### Setup state (already done)
DB freshly reseeded — `Driver Bilal` (driver_id=3) currently rates 3.90 with `is_flagged=0`, no admin notifications, `WELCOME10.usage_count=0`.

### 1. Rider books a peak-hour ride with a promo code
- Sign in as `rider@demo.com`.
- On the Book Ride tab pick: pickup Karachi address, dropoff Karachi address, vehicle ECONOMY, distance 7 km, duration 15 min, promo `WELCOME10`, peak Yes, payment WALLET.
- Click **Book**.

**Pass criteria** — the success banner must show:
- Fare = **480** (computed by `sp_calculate_fare`: `(100 + 25*7 + 3*15) * 1.5 = 480`).
- Promo discount = **48** (10% of 480).
- Amount = **432**.

If sp_calculate_fare were broken or the surge multiplier ignored, the fare wouldn't be 480.

### 2. Driver completes the ride (Trigger 1)
- Sign out, sign in as `driver@demo.com` (Driver Ali — already ONLINE).
- Open **Incoming requests** → the new ride must appear.
- Click **Accept** → confirm both prompts (start, finish).

**Pass criteria** — back in Admin's Reports later: this ride's payment row must show `PAID` and the ride status `COMPLETED` even though we never explicitly set the ride status from the driver side. That proves `trg_payment_paid_complete_ride` fired.

### 3. Rider rates the OTHER driver 1★ (Trigger 2)
- Sign out, sign back in as `rider@demo.com`.
- Ratings tab → select ride **#3** (the in-progress seeded ride with Driver Bilal) → score 1 → submit.

**Pass criteria** — must succeed (no error from the trigger).

### 4. Admin verifies everything
- Sign out, sign in as `admin@demo.com`.
- **Dashboard tab**:
  - KPIs show `Users 7`, `Drivers 3`, completed count > 0, revenue > 0.
  - **Active rides (ActiveRidesView)** — the ride we just finished must be **gone** (status COMPLETED), but other in-progress rides remain.
  - **Top drivers (TopDriversView)** — Driver Ali listed (avg 4.80).
- **Alerts tab** — must contain a notification: *"Driver #3 flagged for low average rating (1.00)."* — proves Trigger 2 fired.
- **Users tab** — Driver Bilal's row when joined with drivers will show flagged state (verified via DB read in shell as evidence).
- **Reports tab**:
  - *Revenue per city* — Karachi row total > 0 (SUM aggregate).
  - *Trips per driver* — Driver Ali row count ≥ 2 (COUNT aggregate).
  - *Low-rated drivers (HAVING AVG(score) < 3.5)* — Driver Bilal must appear.
  - *Full trip report (INNER JOIN)* — at least one COMPLETED row showing rider, driver, vehicle, plate, type, pickup→drop, fare.
  - *All riders (LEFT JOIN)* — must include `Rider Three` with `completed_rides = 0`.
  - *Promo discount usage* — at least one row with code `WELCOME10` and discount Rs 48 (Trigger 3 evidence — shell will also confirm `usage_count = 1`).

### 5. Footer branding
Visible on every page: **"Developed by Vikram Kumar | Roll: 23K-2062 | Section: DS-4B"**.

## Out of scope
- Wallet top-up / driver earnings details (peripheral, not rubric).
- Vehicle verification flow (peripheral).
- TiDB connection (no credentials provided this session).

## Adversarial check
Each step of this plan would visibly break under a different specific defect:
- Wrong fare = procedure broken.
- Ride still IN_PROGRESS in active rides view = Trigger 1 broken.
- No alert in Alerts tab = Trigger 2 broken.
- promo_codes.usage_count = 0 after booking = Trigger 3 broken.
- Rider Three missing from "all riders" list = LEFT JOIN regressed to INNER JOIN.
- Low-rated drivers tab empty = HAVING clause missing.
