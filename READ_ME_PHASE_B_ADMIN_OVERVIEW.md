# Phase B — Admin Overview

Implemented locally on 2026-10-26, on `main` starting from `cef2478`.
No commit, push, cloud deployment, Atlas connection, production mutation, seed, bootstrap, schema change, or new dependency was performed.

## Delivered

`/admin`, `/admin?tab=overview`, and their Arabic equivalents now default to Overview. Orders, Products, Categories and Settings keep their existing deep links and interfaces. Overview provides:

- Four primary cards: gross collected revenue, orders placed in the selected period, current products and current categories.
- Collected AOV, current payment reviews, unfulfilled orders, draft/published counts and low-stock variant counts.
- Today / 7 / 30 / 90 Cairo calendar-day periods, through the response's `calculatedAt` instant. Each period includes the current partial day.
- A responsive SVG revenue chart, zero baseline and clear no-payment state, plus an accessible expandable daily data table.
- The latest eight orders across all dates, with a functional link to their existing Orders detail view. Links survive refresh and browser history.
- Current attention queues for submitted payment proofs, confirmation, packing/shipping, unpaid digital orders, low stock and drafts.
- Top five best sellers in the selected collection period and up to eight exact product/size/grind inventory alerts.
- English/Arabic copy, responsive layouts tested at 320, 390 and 1440px, keyboard controls, abortable requests, explicit loading, empty, error and retry states.

The Overview does not contain hardcoded catalog totals. Three drafts and one category were verified using isolated fixtures; Atlas was deliberately not queried. The running application reads its existing connected database and will display whatever is actually present there.

## Findings and financial definitions

The inspected `Order` schema stores integer-intended piastre amounts, current payment state, and timestamped payment history. Transfer approval appends `paid` at approval time. COD approval is restricted to an unpaid, delivered order and appends its own `paid` event. There is no refund amount ledger, partial-refund amount, or refund endpoint. No schema or payment-write changes were made.

| Value | Exact meaning |
|---|---|
| Collected Revenue | Sum of each order's entire `totalPiastres`, including delivery, at its earliest valid BSON-date `paymentHistory.state='paid'` event within `[from, calculatedAt)`. Gross cash collected, before refunds; not profit. |
| First-paid orders | Number of distinct orders whose earliest valid paid event falls within that interval. Current paid status without a dated event does not qualify. |
| Duplicate approvals | Reduce the complete history to the earliest paid timestamp **before** filtering the reporting period. A repeated event in a later period never counts again. |
| Unpaid / awaiting transfer / rejected | No collection without a recorded paid event. Delivery alone does not make COD revenue. |
| Refunds | Current refunded-order count and distinct orders with a dated refund event in the selected period are available as diagnostics. Amounts are unknown. A rejection is not a refund. |
| Refund amount / net collected | API values are `null`; `refundAccountingComplete=false`. The UI clearly explains why. No full-order refund amount is inferred from a status or event name. |
| Historical refunds/cancellations | An actual earlier collection remains in gross collection on its original paid date even if the order is subsequently refunded/cancelled. Current state must not rewrite historical cash collection. |
| Collected AOV | Gross collected piastres divided by first-paid orders, rounded to the nearest whole piastre (`Math.round`); zero if no paid orders. Includes delivery and historical gross collections later refunded/cancelled, consistent with its numerator. |
| Total Orders | Orders **created** within the selected Cairo period, including cancelled orders. This is distinct from first-paid orders and gross collections. |
| Best sellers | Orders first paid in the selected period, still `paymentState='paid'`, not cancelled, and with no refund event. Rank products by units, then merchandise value. Sum line quantities and line totals; exclude delivery. Use actual historical product-name snapshots. |
| Inventory | Current published products only, including the existing read-only legacy size projection. Alert on configured size/grind combinations at 0–5 units, inclusive. All drafts and archived products are excluded. Empty/unconfigured option lists create no invented variants. |
| Awaiting fulfillment | Current fulfillment states received, confirmed or packing, across all dates. |
| Payment reviews | Submitted proofs still referenced by the corresponding non-cancelled order in awaiting-verification state. Orphaned, superseded and cancelled-order proofs are excluded. |
| Confirmation | Current received orders. |
| Packing/shipping | Current confirmed or packing orders. |
| Unpaid digital orders | InstaPay/Vodafone Cash orders currently unpaid, awaiting transfer or rejected, excluding cancelled orders. Review-in-progress has its own queue. |
| Products/categories/drafts/published | Current database counts across all dates. Total products includes archived products. |
| Recent orders | Latest eight by `createdAt DESC, _id DESC`, independent of selected financial period. |

Current-state queues can change after payment/fulfillment operations. Best sellers can change after later refunds/cancellations, while gross historical collection deliberately remains stable. Re-collection after a genuine refund and partial refunds cannot be represented accurately by the current model; a future amount-bearing payment/refund ledger is required for that lifecycle and net reporting.

Missing dated collections on paid/refunded orders are counted separately and flagged in the UI, rather than backdated to order creation. Unsafe/non-integer aggregate amounts fail closed with an API error; no approximate monetary figure is returned.

## Cairo reporting boundaries

The server uses `Intl` with `Africa/Cairo` to derive calendar dates and binary-search the first instant of the starting day. It does not subtract a fixed number of 24-hour intervals or assume a permanent UTC offset. MongoDB groups the resulting paid-event dates with `Africa/Cairo` as well. Both the 23-hour April 24, 2026 day and the 25-hour October 29, 2026 day were tested, including actual MongoDB grouping around the skipped/repeated hour.

The MongoDB operator accepts named timezones ([official `$dateToString` documentation](https://www.mongodb.com/docs/v7.0/reference/operator/aggregation/datetostring/)). Runtime ICU and MongoDB timezone databases must remain current as part of normal platform maintenance.

## API, security and query cost

`GET /api/admin/overview?range=30d` accepts only a scalar `range` of `today`, `7d`, `30d`, or `90d`; omitted range defaults to 30d. Unknown parameters, custom dates, arrays, duplicate ranges and injection-shaped values are rejected. Response body: `{ overview: { period, calculatedAt, financial, metrics, attention, lowStock, series, bestSellers, recentOrders } }`.

The dedicated router retains the database readiness guard, real session loader and `requireRole('admin')`. It applies `Cache-Control: no-store` to successes and failures and limits authenticated requests to 30/minute. Database errors flow to the existing generic server error handler.

Each response issues five bounded-result aggregations and one projected recent-order query, in parallel. Each query has a 5-second server-side execution limit. Raw order sets are never downloaded for JavaScript analytics. The service only fills at most 90 daily aggregate buckets and formats bounded results in JavaScript. All analytics operations are reads; there are no `$out`, `$merge`, updates or schema migrations.

The existing recent-order compound index supports the recent sort, the proof state index supports the submitted-proof match, and the product status indexes support the existing filtered Products list. Deriving earliest payment events and all-date operational totals can require collection scans. No index was added or recommended without representative production `explain` evidence. At significant order volume, measure these read queries before selecting an index/materialization strategy. There is no claim that the isolated fixture timing predicts Atlas latency.

Recent-order output is explicitly allowlisted: ID, order number, creation date, amount and two statuses. No customer name, email, phone, address, user ID, proof key/URL, or payment-history reasons appear in Overview. Authorized order details remain in the existing protected Orders API.

## Files created

- `client/src/admin/AdminOverview.jsx` — dedicated request, dashboard state and composition.
- `client/src/admin/OverviewWidgets.jsx` — metric, status and accessible SVG-chart components.
- `client/src/admin/overview-copy.js` — bilingual labels and Cairo/currency formatting.
- `client/src/admin/admin-overview.css` — scoped dashboard styling and responsive layout.
- `server/src/admin/overview-values.js` — strict input, Cairo boundaries and shared queue filter definitions.
- `server/src/admin/overview-pipelines.js` — read-only MongoDB aggregations.
- `server/src/admin/overview-service.js` — bounded queries, response formatting and number validation.
- `server/src/routes/overview.routes.js` — protected read-only route.
- `server/test/overview.test.js` — unit/service tests.
- `server/test/overview-api.test.js` — real session/role middleware with mocked model reads and loopback HTTP.
- `server/test/overview-integration.test.js` — actual MongoDB pipeline tests, restricted to a disposable loopback database.
- `tests/browser/overview-fixtures.mjs` — test-only data using the production response formatter.
- `READ_ME_PHASE_B_ADMIN_OVERVIEW.md` — this guide.

## Files modified in Phase B

- `client/src/admin/CatalogAdmin.jsx` — default Overview, tab navigation, publication filter, query-driven pagination and product deep links. Dashboard links reset a previously visited product page instead of showing an empty later page.
- `client/src/admin/AdminOrders.jsx` — query-driven queues, pagination and order details, abortable list/detail reads and detail focus.
- `client/src/admin/catalog-admin.css` — keep the five tab labels on one line within the existing mobile scroll area.
- `server/src/app.js` — mount Overview router.
- `server/src/routes/catalog.routes.js` — validated optional admin publication-status filter.
- `server/src/routes/commerce.routes.js` — shared allowlisted attention-queue filters; combine status and queue with AND.
- `tests/browser/navigation.browser.mjs` — preserve the previous 42 regressions and add 11 Overview cases.

The pre-existing `client/.env.example`, App, Header, public stylesheet, floating language component and both SVG flags remain byte-identical to the Phase B entry snapshot. The existing browser test file was extended. No packages or lockfiles changed. Existing payment, checkout, registration, mail and noindex protections remain intact.

## Verification actually run

| Check | Result |
|---|---|
| Backend full suite, including real MongoDB aggregation test | **61/61 passed**, 0 skipped |
| Root unit/SEO/static-head/HTML-audit tests | **23/23 passed** |
| Full browser suite | **53/53 passed**, including all prior 42 regressions |
| Frontend ESLint | Passed |
| Production Vite build and static heads | Passed; 14 protected heads generated |
| Prelaunch source checker | **18/18 passed** |
| Built HTML audit | **14/14 public routes passed** |
| Git whitespace check | Passed |
| Visual review | Populated desktop EN, populated mobile AR and zero-sales 320px EN screenshots inspected |
| Protected local-change hashes | All seven non-test files above unchanged |

The isolated MongoDB 8.0.16 executable was downloaded from MongoDB's official archive into the ignored `.playwright/mongo/` directory. Only its executable was extracted; no dependency/package installation was needed. It was bound to `127.0.0.1:27028`. Integration tests reject remote hosts, credentials and database paths, create a unique `qc_overview_test_<random>` database, and drop only that database in `finally`. Test orders/inventory were written only there. No Atlas URI, credential or `.env` file was used to run these tests.

Browser APIs are entirely intercepted; external requests are blocked. Tests cover desktop/mobile/RTL, chart periods, default and explicit Overview routes, old tabs, order detail refresh and Back, all four order queues, draft filtering, exact product links, loading/error/retry/zero states, guest/customer guards, floating language behavior and the earlier public navigation repairs.

Logs/screenshots are ignored local artifacts in `.playwright/`: `overview-backend-results.txt`, `overview-root-tests.txt`, `overview-browser-all.txt`, and `overview-1440-en.png`, `overview-390-ar.png`, `overview-320-en.png`.

### Repeat checks

From the repository root:

```powershell
npm.cmd test --prefix server
node --test tests/*.test.mjs
npm.cmd run lint --prefix client
npm.cmd run build --prefix client
node scripts/prelaunch-check.mjs
node scripts/audit-built-html.mjs
git diff --check
```

By default the actual-MongoDB test is explicitly skipped. To include it, start a dedicated loopback test MongoDB (the ignored portable executable remains available) and set the test-only variable; never point it at Atlas:

```powershell
.playwright/mongo/bin/mongod.exe --dbpath .playwright/mongo/data --bind_ip 127.0.0.1 --port 27028 --logpath .playwright/mongo/test-server.log
# In another terminal:
$env:QC_OVERVIEW_TEST_MONGO_URI = 'mongodb://127.0.0.1:27028'
npm.cmd test --prefix server
```

For browser tests, start Vite on loopback, reuse the existing Playwright runtime, then run the test file. No backend is required for the mocked browser suite:

```powershell
npm.cmd run dev --prefix client -- --port 5174 --strictPort
# Another terminal; only set these if Playwright/browser are external to the repo:
# $env:PLAYWRIGHT_MODULE_PATH = 'C:/path/to/node_modules/playwright'
# $env:PLAYWRIGHT_CHROMIUM_EXECUTABLE = 'C:/path/to/chrome.exe'
node --test tests/browser/navigation.browser.mjs
```

## Manual browser review

1. Use the existing authorized local API configuration and Vite frontend. Sign in with your existing admin account. Open `/admin`, then `/admin?tab=overview`: Overview is selected. Repeat `/ar/admin`.
2. Check actual Products/Categories totals against those tabs. If the current database still contains three drafts and one category, these counts should show 3 and 1. With no orders, revenue and placed-order counts remain zero; the graph, best sellers and recent orders explain the empty state.
3. Switch Today, 7, 30 and 90 days. Inspect the `/api/admin/overview?range=...` response in DevTools; verify the Cairo boundaries, series and no-store header. Open daily values with the keyboard. Collection totals can differ from placed-order totals because their dates and eligibility differ.
4. If genuine existing orders are present, use View order. Confirm the existing detail panel opens, refresh the deep URL, close it, then use browser Back. Do not create test orders in Atlas for this check.
5. Click each attention queue. Verify its Orders dropdown and API queue value; combine with the fulfillment status filter. Click Drafts awaiting publication and verify the Products status filter. A low-stock row or best-seller row opens the corresponding product editor, even if its record is not on the first list page.
6. Use all five tabs and existing product/category/settings interfaces without saving unrelated changes. A language change while editing a deep-linked product does not refetch and overwrite the draft solely because of language.
7. At 320px and 390px, check cards, period controls, horizontally scrollable recent orders, tabs and keyboard outlines. Switch EN/AR using the unchanged floating toggle; verify route/query preservation and RTL layout.
8. Use DevTools request blocking for `/api/admin/overview` to exercise the error state. Unblock and select Try again. A failure must not display fabricated zero metrics. Check loading state under network throttling.
9. Sign out and open `/admin`: it should route to Login. The mocked tests also verify customer redirection and server 401/403 enforcement; do not create new production accounts for testing.

## Remaining limits

- Atlas/live authentication, hosted infrastructure, physical devices and production response times were not verified. The route uses the existing runtime database connection; no live data inventory is claimed here.
- Refund amounts, partial refunds, net revenue and profit remain unavailable until an approved amount-bearing ledger exists. No payment workflow or data migration was added.
- Counts/aggregations run in separate parallel reads, not a snapshot transaction; concurrent admin/payment changes may create a brief difference between counters. `calculatedAt` bounds financial dates but is not a database snapshot guarantee.
- Financial history is derived on demand; large volumes need measured query-plan review. Queries fail after 5 seconds instead of inventing values.
- Exact paid-event date reporting depends on historical events actually having been recorded. Missing events are excluded and disclosed; no backfill is attempted.

## Git review

No commit or push. The status below includes the pre-existing floating-switcher changes and `.env.example` owner change as well as Phase B. A cumulative local review patch excluding `.env.example` is saved at `.playwright/phase-b-review.patch`.

```text
 M client/.env.example
 M client/src/App.jsx
 M client/src/admin/AdminOrders.jsx
 M client/src/admin/CatalogAdmin.jsx
 M client/src/admin/catalog-admin.css
 M client/src/components/Header.jsx
 M client/src/style.css
 M server/src/app.js
 M server/src/routes/catalog.routes.js
 M server/src/routes/commerce.routes.js
 M tests/browser/navigation.browser.mjs
?? READ_ME_PHASE_B_ADMIN_OVERVIEW.md
?? client/public/flags/
?? client/src/admin/AdminOverview.jsx
?? client/src/admin/OverviewWidgets.jsx
?? client/src/admin/admin-overview.css
?? client/src/admin/overview-copy.js
?? client/src/components/FloatingLanguageSwitcher.jsx
?? server/src/admin/
?? server/src/routes/overview.routes.js
?? server/test/overview-api.test.js
?? server/test/overview-integration.test.js
?? server/test/overview.test.js
?? tests/browser/overview-fixtures.mjs
```

Tracked diff summary (includes earlier uncommitted changes; new untracked files are listed above):

```text
 client/.env.example                  |   4 -
 client/src/App.jsx                   |   3 +-
 client/src/admin/AdminOrders.jsx     |  33 +++++---
 client/src/admin/CatalogAdmin.jsx    |  35 ++++++--
 client/src/admin/catalog-admin.css   |   1 +
 client/src/components/Header.jsx     |   1 -
 client/src/style.css                 |  38 ++++++++-
 server/src/app.js                    |   2 +
 server/src/routes/catalog.routes.js  |   4 +-
 server/src/routes/commerce.routes.js |   7 +-
 tests/browser/navigation.browser.mjs | 156 ++++++++++++++++++++++++++++++++++-
 11 files changed, 249 insertions(+), 35 deletions(-)
```
