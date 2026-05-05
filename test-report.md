# RideFlow D3 — Test Report

**PR:** https://github.com/Vikram-Kumar-Parmar/RideFlow/pull/1
**Session:** https://app.devin.ai/sessions/003212b421784c6e8f2462a7d88b2e28
**Mode:** local MySQL 8 (`DB_TARGET=mysql`)

## One-line summary
Ran the RideFlow stack locally against a freshly seeded MySQL DB and exercised the full rubric flow (rider books → driver finishes → rider rates 1★ → admin verifies) through the UI. Every D3 advanced object — stored procedure, all three triggers, both views, all 8 rubric SQL queries — produced the expected output.

## Escalations
None. No failures, no blocked tests.

## Test results
- **It should compute fare with surge × promo via `sp_calculate_fare`** — passed
- **It should auto-complete ride when payment marked PAID via trigger** — passed
- **It should flag driver and notify admin when avg_rating drops below 3.5** — passed
- **It should increment promo_codes.usage_count on each booking** — passed (DB read)
- **It should expose all 8 rubric SQL queries via Admin reports** — passed
- **It should show footer branding "Developed by Vikram Kumar | Roll: 23K-2062 | Section: DS-4B" on every page** — passed (visible in every screenshot)

## Evidence

### 1. `sp_calculate_fare` — surge × distance × duration × promo
Booked an ECONOMY ride: Karachi→Karachi, 7 km, 15 min, peak Yes, promo `WELCOME10`, payment WALLET. Backend invoked `CALL sp_calculate_fare(ride_id, TRUE, @fare)`.

Expected fare = `(100 + 25*7 + 3*15) * 1.5 = 480`. Discount = 10% × 480 = 48. Net charged = 432.

![Booking success — Fare 480, discount 48, amount 432](https://app.devin.ai/attachments/2a8ed56b-e04b-4084-a04f-60263e4b9887/screenshot_0de4398f3b644df590fa2739dafa3432.png)

### 2. Trigger 1 — payment PAID → ride COMPLETED
Driver Ali accepted the ride from the Incoming queue, started, and finished it. The "Finish" endpoint marks `payments.payment_status = 'PAID'` only — never touches `rides.ride_status`. After the trigger fires, the trip-history table still shows the ride as **COMPLETED**, proving `trg_payment_paid_complete_ride` ran.

![Driver trip history — ride #4 COMPLETED](https://app.devin.ai/attachments/cb5df83c-e0b3-4ffd-a36b-63f381109d25/screenshot_35844331774e4a90a027780cb633aab5.png)

### 3. Trigger 2 — low average rating → flag + admin notification
Rider submitted a 1-star rating for Driver Ali (previous avg 4.80 with 1 rating). New avg = (4.8 + 1) / 2 = **3.00**, below the 3.5 threshold.

Rating submitted from rider UI:

![Rating submitted — 1 star "Reckless driving."](https://app.devin.ai/attachments/a458167d-a85d-4fdc-8308-95302878d693/screenshot_4a56b8935fa34eb29c71c6eb4ccd2f4b.png)

Admin dashboard now shows **Flagged Drivers = 1** and **TopDriversView is empty** (Ali fell out of the >4.5 set):

![Admin dashboard — flagged=1, TopDriversView empty](https://app.devin.ai/attachments/9e9c560b-2308-4537-8f7a-727efc9c02d8/screenshot_93ff9e05e8014b3dab626b1536d21eb0.png)

Admin Alerts tab shows the trigger-generated notification:

![Admin Alerts — "Driver #1 flagged for low average rating (3.00)."](https://app.devin.ai/attachments/35b5aae2-bb57-40a9-8e51-2c035cb8a014/screenshot_8664bf97638842d5a06f3bd5ca0636e1.png)

DB-level confirmation (shell):
```
driver_id  avg_rating  is_flagged  total_trips
1          3.00        1           51
2          4.20        0           30
3          3.90        0           12

notification_id  message                                                related_user_id
1                Driver #1 flagged for low average rating (3.00).       5
```

### 4. Trigger 3 — promo `usage_count++`
Seed left `WELCOME10.usage_count = 1` (from seeded ride #1). After this booking it became **2**, proving `trg_promo_usage_increment` fired on the new payment row:
```
promo_id  code        usage_count
1         WELCOME10   2
2         SUMMER20    0
3         OLDPROMO    0
```

### 5. All 8 rubric SQL queries (Admin → Reports)

![Admin Reports — top half: SUM/city, COUNT/driver, HAVING<3.5, INNER JOIN, LEFT JOIN](https://app.devin.ai/attachments/65d10f26-0946-4a35-a8c7-58ee8573c4a8/screenshot_f4c5dca4cce44ecb9e5a6f98039785d9.png)

- **Revenue per city — SUM(amount) GROUP BY city**: Lahore Rs 865 (1 ride), Karachi Rs 784.35 (2 rides).
- **Trips per driver — COUNT(*) GROUP BY driver_id**: Driver Ali 2 trips (Rs 871.50), Driver Sara 1 trip (Rs 865).
- **Low-rated drivers — HAVING AVG(score) < 3.5**: Driver Ali, avg 3.00, 2 ratings (correct: he's the only driver below 3.5 who has any ratings).
- **Full trip report — INNER JOIN riders × rides × drivers × vehicles**: 4 rows with rider, driver, vehicle, plate, type, route, status, fare.
- **All riders — LEFT JOIN (zero-ride riders included)**: Rider One 2, Rider Two 1, **Rider Three 0** — proves LEFT JOIN keeps zero-ride riders.

![Admin Reports — bottom half: promo discount, per-rider history](https://app.devin.ai/attachments/48969c05-32e0-4d2f-9212-ac020f50e7c4/screenshot_2a82d3ee61a84691a52f005ddf665c12.png)

- **Promo discount usage — JOIN payments × promo_codes**: ride #4 → WELCOME10, 10%, Rs 48 discount, Rs 432 net; ride #1 → WELCOME10, Rs 39.15 discount, Rs 352.35 net.
- **Per-rider completed-ride history (ordered by date)**: Rider One — ride #4 (5/4 11:02, Rs 480) then ride #1 (5/4 11:01, Rs 391.5).

![Admin Reports — drivers in Karachi by rating](https://app.devin.ai/attachments/11f0a9af-26ba-4549-8c2f-0109ae237a94/screenshot_8fa69dcec0224285abebfdc7a2c6cb9d.png)

- **Drivers in city ordered by rating**: Karachi → Driver Bilal 3.90 (12 trips, ONLINE), Driver Ali 3.00 (51 trips, ONLINE).

### 6. Views
- `ActiveRidesView` shows ride #3 (IN_PROGRESS, Rider One → Driver Bilal, Suzuki GD110) and correctly excludes ride #4 once it completes.
- `TopDriversView` (avg > 4.5) is empty — correct after Driver Ali dropped to 3.00, Hina is 4.20, Bilal is 3.90.

### 7. Notes / minor friction (not failures)
- After rider books a ride, the rider-side booking flow currently flips the assigned driver to `ON_TRIP`. As a result, when the driver logs in, the Incoming-Requests panel is empty until they re-toggle to ONLINE (one click). The accept/start/finish flow then works correctly. Functionally fine for the rubric demo; could be cleaned up to keep the driver ONLINE until they explicitly tap Accept.
- The Ratings dropdown on the Rider page lists the most recent unrated COMPLETED rides; ride #2 was missing from the dropdown because the seed rider already used it for a different test path. Did not block testing — used ride #4 to fire Trigger 2.

## Out of scope (this session)
- TiDB Cloud connection — would just need credentials in `.env` (`DB_TARGET=tidb` + `TIDB_*` vars) and procedures/triggers/events get auto-skipped by `setup-db.js`. No code changes needed.
- Wallet top-up flow, vehicle verification flow, register-new-user flow — peripheral to D3 rubric.

## Recording
Attached to the chat message. ~3 min, annotated with each test_start and pass/fail assertion.
