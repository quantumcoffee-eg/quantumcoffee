# Phase C2 — payment accounting and refund safety

Implemented locally on `main`, from C1 commit `5d1f220`. No commit, push, deployment, production connection, migration or provider transfer was performed. The pre-existing four-line deletion in `client/.env.example` is preserved. No dependencies were added.

**Confirmed gaps**

- C1's `server/src/commerce/payment-service.js` recorded paid history and proof approval without an independent amount-bearing monetary event. A screenshot was a submitted claim, not proof of receipt. COD required delivery plus separate approval.
- The old `server/src/admin/overview-pipelines.js` inferred gross collection from earliest dated paid history and the order total. Repeated history was reduced to its first date, but amounts were not immutable monetary records.
- A `refunded` state/history could not prove an amount, an external movement date or actual refund completion. Overview correctly withheld refunds/net.
- C1 already supplied snapshot/majority transactions, bounded retries, revision/race protection and transactional outbox enqueueing. These remain intact. Outbox enqueueing is not proof of delivery or money movement.

**Accounting model and definitions**

`PaymentEvent` is an append-only application journal: insertions require an active transaction; existing-event save/update/replace/delete/bulk mutations are blocked. Events contain the order, unique event key, kind, positive integer piastres, signed direction, EGP currency, method, occurrence/recording times, administrator identity, revision, reason and applicable source/proof/refund/evidence references.

| Measure | Exact definition |
| --- | --- |
| Gross collected revenue | Valid initial collection amounts whose occurrence timestamps fall within the selected Cairo period. Includes delivery; not profit or an imported bank statement. |
| Initial collection | One per order, using the verified server order total. Digital receipt requires authorized manual verification; COD requires delivery and explicit payment approval. Uploading proof never creates money. |
| Collection time | Administrator verification time, also used as recording time. Actual bank settlement time is not captured by the existing workflow and is not invented. |
| Paid orders | Initial collection events in the period, protected by a unique per-order index; not order creation counts or all orders currently paid. |
| Recorded refunds | Verified refund amounts by external completion time in the period. Requests/reported but unverified completion have no monetary event. |
| Net collections | Period gross minus period recorded refunds, only when all-date reconciliation detects no gaps. Otherwise null/Unavailable. Can be negative when refunding earlier collections. |
| Average collected order value | Period gross divided by initial collected-order count; rounded to the nearest integer piastre, zero when none. Refunds do not rewrite original AOV. |
| Refunded-order count | Distinct orders with any recorded refund in the period, including partial refunds. The separate current-refunded count covers fully refunded states across all dates. |
| Pending reviews | Existing submitted proofs linked to eligible current orders awaiting verification, excluding intentions/orphans. |
| Best sellers | Initially collected in period, currently paid, not cancelled, and no refund/reversal/correction at any date. Any partial refund excludes the whole order because item allocation is unapproved. |

All calculations use integer Egyptian piastres; UI formatting converts to EGP. Today/7/30/90-day boundaries use Africa/Cairo calendar dates, daylight-saving rules and `[from,to)` instants, with a partial current day. Refund occurrence and verification times are separate; late verification can restate a historical period.

Reversal/correction kinds reserve signed, source-linked representations requiring authorization/evidence metadata. There is **no enabled recording workflow or route** for them. Their presence triggers review and suppresses net; cash/state/reporting semantics need a future approved policy. Old events are never overwritten to correct accounting.

**Transactions and indexes**

Approval atomically commits payment state/revision, history with monetary-event reference, digital proof review, collection and enabled/eligible outbox entries. Any failure rolls everything back. SMTP/R2 never run inside these retried callbacks. The C1 three-body-attempt and 15-second transaction limits remain unchanged. Stable event IDs survive body retries; exact approval revision/actor/reason retries recover a committed event without duplicating history/mail. Other stale/different actions retain conflicts. Legacy paid orders cannot be reapproved to manufacture missing money.

New PaymentEvent indexes: unique event key; unique `{orderId,kind}` partial on collection; unique external reference partial on refund (also across orders/different reported methods); `{occurredAt,kind}` and `{orderId,occurredAt}`. RefundCase adds unique request key, `{orderId,createdAt}` and `{state,createdAt}`. Initialization is awaited before accounting writes. Future deployment must review collection/index provisioning; this task executed it only in disposable test databases.

The transaction foundation follows [MongoDB's atomic multi-document transaction guarantees](https://www.mongodb.com/docs/manual/core/transactions/) and was exercised with actual local replica-set transactions, not mocked callbacks.

**Refund foundation remains hard-disabled**

No refund endpoint, UI completion action, provider integration, worker or timer exists. `REFUND_RECORDING_ENABLED` is hard-coded false; the default authorization policy denies. An alternate test policy is accepted only on loopback `qc-c1-rs` with a disposable `qc_c1_test_<32 hex>` database. Application/production policy injection is rejected. Environment variables cannot enable refunds.

The proposed isolated-test-only workflow is:

1. Request: fixed collection/order, integer amount bounded by known balance, request key, reason and administrator. Audit only; no money event.
2. Report external completion: actual refund method, external reference, evidence digest, occurrence time, reporting identity/time. No transfer or money event. Pending external completion triggers incomplete accounting.
3. Independent verification: an authorized administrator different from requester and reporter verifies real external evidence. Inside a transaction, recheck balance/history, append refund/audit/outbox, and mark the case recorded. Partial refunds retain paid; the final portion sets refunded.

Cash/bank transfer/InstaPay/Vodafone Cash are evidence-record representations, **not owner-approved refund channels**. The external method is required, not inherited from the order. A digest identifies evidence; a hash alone does not establish a transfer. Future references must use an approved canonical/provider-qualified format.

Concurrent verifications serialize on order revisions and recalculate remaining balance. Repeated cases recover the same event; globally unique external references prevent double deduction, including different-order races. Missing legacy collections, over-refunds and unsupported adjustments fail closed. More than 1,000 adjustment records per order requires manual review.

Refunds never restore stock or alter fulfillment. C1's paid-history guard still blocks ordinary cancellation after partial/full refunds. Return inspection and exact-variant restoration require a separate approved process; this phase does not invent return or delivery-refund entitlements.

**Overview and reconciliation**

Overview now uses monetary events rather than history for money, showing recorded refunds, net, refunded-order counts and explicit incomplete-accounting notices. When incomplete, gross/refunds are known recorded amounts and net is unavailable. Malformed/fractional monetary values are excluded from totals and diagnosed.

`GET /api/admin/overview/reconciliation` is admin-authenticated, read-only, no-store, rate-limited and rejects all query parameters. Five aggregations identify missing/duplicate collections and paid histories; amount/method/audit/state conflicts; excess/invalid/unlinked refunds; approved proofs without collections; collections without matching approved reviews; orphan events; unverified refund records; pending external completion; and reserved adjustments requiring review. No repair is automatic.

All-date counts accompany at most 25 detail rows. Only order IDs/numbers and fixed issue codes are returned, without customer contacts/addresses, evidence hashes, transfer references or private object keys. The bilingual on-demand panel supports keyboard opening, loading/error/retry/refresh and existing-order links. Orphan references have no misleading view-order link.

Each aggregation is bounded to five seconds. Overview performs a fixed ten aggregations and one projected eight-order query. Global integrity checks still scan all-date records with indexed lookups: cost grows with order volume and should be measured before future scaling. Separate reads are not one reporting snapshot; concurrent writes can cause temporary discrepancies, requiring refresh/review. No live Atlas-performance or bank-reconciliation claim is made.

**Backward compatibility**

`Order.paymentHistory.eventId` and outbox monetary metadata are optional; existing documents remain readable. The outbox refund kind is additive. Existing tabs, locale/navigation utilities and safety locks remain intact.

No historical order is silently backfilled. Legacy paid/refunded states or histories without monetary events are excluded and diagnosed; authoritative net is suppressed across reporting periods. Any evidence-backed import requires owner approval and a separate reviewed migration/dry run. None is included or executed.

Append-only guards protect application-model operations, not database WORM storage. Raw/privileged database access can bypass them and requires separate least-privilege/operational review. This ledger records authorized human assertions, not independently verified bank movements. SMTP delivery would remain at least once if separately enabled.

**Files created**

| File | Purpose |
| --- | --- |
| `server/src/accounting/append-only.js` | Event mutation/session guards. |
| `server/src/accounting/refund-foundation.js` | Disabled request/report/verify transactions and balance validation. |
| `server/src/accounting/reconciliation.js` | Bounded integrity checks and privacy projection. |
| `server/src/accounting/reporting.js` | Monetary series/refund counts/best-seller aggregations. |
| `server/src/models/PaymentEvent.js` | Ledger schema/indexes. |
| `server/src/models/RefundCase.js` | Separate external-refund lifecycle. |
| `client/src/admin/AccountingReconciliation.jsx` | Accessible bilingual read-only report. |
| `server/test/accounting-api.test.js` | Authorization, queries, disabled routes/policy and financial units. |
| `server/test/accounting-transactions.test.js` | Real replica-set concurrency/failure/accounting scenarios. |
| `READ_ME_PHASE_C2_PAYMENT_ACCOUNTING.md` | This handoff. |

**Files modified**

| File | Purpose |
| --- | --- |
| `server/src/commerce/payment-service.js` | Atomic collection and exact retry recovery. |
| `server/src/commerce/service-context.js` | Accounting models and monetary outbox metadata. |
| `server/src/models/Order.js` | Optional event audit reference. |
| `server/src/models/OrderMail.js` | Optional monetary metadata/refund kind. |
| `server/src/notifications/order-mail.js` | Pass metadata into transactional enqueueing. |
| `server/src/notifications/order-mail-values.js` | Verified event references/amounts. |
| `server/src/notifications/order-mail-content.js` | Verified refund copy with actual partial/full amount. |
| `server/src/admin/overview-pipelines.js` | Remove history-based money; retain operational queries. |
| `server/src/admin/overview-service.js` | Ledger financial metrics/completeness. |
| `server/src/routes/overview.routes.js` | Protected reconciliation route. |
| `server/testing/isolated-commerce.js` | Test accounting models/indexes and owned-database cleanup. |
| `server/package.json` | Serial tests because Mongo command failpoints are server-global. |
| `server/test/overview.test.js` | Ledger zero state and bounded query expectations. |
| `server/test/overview-integration.test.js` | Explicit ledger fixtures, legacy gaps and real Mongo Cairo boundaries. |
| `server/test/order-mail.test.js` | Refund reference/amount/copy checks. |
| `client/src/admin/AdminOverview.jsx` | Monetary fields, disclosure and report integration. |
| `client/src/admin/overview-copy.js` | Bilingual definitions/issues/labels. |
| `client/src/admin/admin-overview.css` | Responsive metrics/report, wrapping and focus styles. |
| `tests/browser/overview-fixtures.mjs` | Offline synthetic ledger/report fixtures. |
| `tests/browser/navigation.browser.mjs` | Five accounting regressions plus existing tests. |

`client/.env.example` is a separate pre-existing edit. No `.env`, lockfile, public storefront component, floating switcher, SVG flag, or C1 inventory/transaction helper changed.

**Executed validation**

| Check | Final result |
| --- | --- |
| Complete backend | **126 passed, 0 failed, 0 skipped**; parent tests included. |
| C2 real replica-set suite within that total | **25 passed**: 24 scenarios plus parent. Digital/COD, rejection, duplicate/concurrent approval, rollback/outbox, body/commit interruption and genuinely executed uncertain commit; disabled production policy; full/partial/concurrent refunds, references/methods, dates, bounds, legacy/privacy, append-only/indexes and reconciliation. |
| Existing C1 replica-set suite within total | **26 passed**: 25 stock/order/payment scenarios plus parent. |
| Full offline Chromium regressions | **58 passed, 0 failed, 0 skipped**; existing 53 plus five accounting cases. |
| Final focused accounting browser rerun | **5 passed, 0 failed, 0 skipped**, after final label updates. |
| Root SEO/source tests | **23 passed, 0 failed, 0 skipped**. |
| Frontend ESLint / production build | Both passed; 14 static route heads generated; indexing remains disabled. |
| Prelaunch source checker | **18 checks passed**. |
| Built HTML audit | **14 routes passed**, noindex verified. |
| Git whitespace | Passed. |
| Visual inspection | English desktop and 320px Arabic screenshots inspected; no horizontal overflow/clipped report/displaced floating toggle. |

Tests used MongoDB 8.0.16 only at `127.0.0.1:27029`, dedicated set `qc-c1-rs`. The helper rejects Atlas, remote/authenticated URIs, existing database paths and non-test names, then generates/cleans its own unique test database. It never loads application environment/Atlas credentials. See C1's handoff for local binary setup.

An invalid failpoint-override combination initially asserted in disposable MongoDB. It was restarted and the exact orphaned fixture database identified from its creation log was removed. The corrected test uses delayed write-concern acknowledgement failures without overriding error labels, genuinely executes the commit and passes. A browser assertion was corrected to use the actual Intl EGP formatter. Final counts above come from passing runs, not those initial failures.

Browser APIs are mocked in memory with external requests blocked; backend writes use actual isolated transactions. Live browser-to-Atlas payment writes, physical receipt, external refund evidence verification and SMTP sending were deliberately not exercised.

Ignored artifacts: `.playwright/c2-backend-all.txt`, `c2-browser.txt`, `c2-browser-focused.txt`, `c2-source-tests.txt`, desktop/mobile PNGs and `c2-review.diff`. The review diff includes all new C2 source files and this report, and excludes the owner's environment-example change.

**Reproduce and manually verify**

Start the dedicated local replica set in a separate repository-root terminal:

```powershell
.playwright/mongo/bin/mongod.exe --dbpath .playwright/mongo/c1-rs-data --bind_ip 127.0.0.1 --port 27029 --replSet qc-c1-rs --setParameter enableTestCommands=1 --logpath .playwright/mongo/c1-rs.log
```

Then:

```powershell
node server/testing/init-local-replica.js
$env:QC_COMMERCE_TEST_MONGO_URI='mongodb://127.0.0.1:27029/?replicaSet=qc-c1-rs'
$env:QC_OVERVIEW_TEST_MONGO_URI='mongodb://127.0.0.1:27029'
npm.cmd --prefix server test
node --test tests/*.test.mjs
npm.cmd --prefix client run lint
npm.cmd --prefix client run build
node scripts/prelaunch-check.mjs
node scripts/audit-built-html.mjs
git diff --check
```

Start Vite separately with `npm.cmd --prefix client run dev -- --port 5174 --strictPort`. Browser tests use the already available local Playwright installation; no dependency was installed:

```powershell
$env:PLAYWRIGHT_MODULE_PATH='C:/Users/youss/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright'
$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE='C:/Users/youss/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe'
node --test tests/browser/navigation.browser.mjs
```

Manual read-only checks: open `/admin`, switch all periods, inspect recorded refunds/net and open/refresh reconciliation. Follow an affected existing order if present. Repeat `/ar/admin` at 320–390px and desktop widths, open the report with keyboard Enter, check RTL/focus/wrapping, floating language control and all existing tabs. Legacy discrepancies must show unavailable net. Use isolated tests for mutations; never create fake orders or approve fake payments in Atlas.

**Owner decisions before activation**

- External execution and independent verification process, administrator responsibilities, evidence authenticity/retention.
- Eligibility, item/delivery entitlements, partial allocation and supported refund channels; a numerical ceiling is not an entitlement policy.
- Canonical external references and escalation of disputed/unmatched movements.
- Separate return inspection and exact-variant restocking rules.
- Reversal/correction authorization, accounting, state and reporting semantics; currently reserved and fail closed.
- Evidence-backed legacy reconciliation/import; settlement-date capture if bank-date reporting is required.
- Database privileges and future volume/performance review. Email delivery remains a separate disabled feature.

Checkout, registration, email delivery, expiration scheduling and live refunds remain disabled. No Tap & Wrap resource, production receiver setting or noindex protection changed.

**Git handoff**

`main`, base `5d1f220`: **20 modified C2 files and 10 new files**, plus the separate pre-existing `client/.env.example` modification. Nothing staged, committed or pushed. `git status --short` and `git diff --stat` show tracked edits; `.playwright/c2-review.diff` also includes new files. The review patch excludes `client/.env.example`.
