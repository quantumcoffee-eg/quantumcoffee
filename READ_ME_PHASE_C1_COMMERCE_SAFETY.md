# Phase C1 — Commerce reliability and security

Implemented locally on `main`, starting at `53f79c4`, on 2026-10-26.
Only `client/.env.example` was modified at entry; it remains byte-identical to its entry snapshot.
No commit, push, deployment, Atlas connection/write, seed, bootstrap, payment-setting change, schema migration, or new dependency was performed.

## Confirmed findings

1. **Good baseline, previously unproven under real failures:** checkout already used conditional stock updates, transactions and unique checkout keys. Cancellation already incremented revisions and blocked repeated state transitions. Inspection alone did not establish an overselling defect. Actual replica-set tests now exercise these guarantees and the additional guards below.
2. **Limiter memory/bypass gaps:** its Map could keep growing while new active keys arrived. Keys included raw record paths, so rotating IDs created fresh allowances. Routers with identical local paths could share an unintended bucket. The replacement has a strict global 5,000-record cap, fixed-size hashed keys, one expiry-heap entry per record, per-middleware namespaces and stable IP/subnet identities. Capacity rejects new buckets rather than evicting active counters.
3. **Transaction retry failure confirmed with MongoDB faults:** the installed Mongoose **8.24.5** save-document rollback handler attempted to restore `__v` on strict embedded documents after an insert failed. It threw `StrictModeError`, masking the original failure and preventing retry. New Order/PaymentProof documents now use schema-validated `insertMany`, created fresh per attempt, while retaining Mongoose connection transactions. No schema or dependency change was needed.
4. **Idempotency error and identity gaps:** duplicate-key recovery did not map different request content to a clear conflict in every path. It also did not bind recovery to the original customer account. Recovery now checks both the unchanged validated-request fingerprint and stored `userId`; mismatches return `CHECKOUT_CONFLICT`/409. A guest key remains a high-entropy capability requiring the same validated request data; it is not converted into another account's order.
5. **Proof/cancellation inconsistencies:** cancellation could restore stock while a submitted proof remained awaiting review. A fast confirmation replay could then report success on a cancelled order. Manual cancellation now requires review of submitted/approved proofs first; confirmation replay checks current state inside the transaction before reporting recovery. Intent creation also writes the order, serializing new uploads with cancellation/expiration.
6. **Retry timing/error handling:** transaction callback retries previously had no application attempt cap. The shared runner permits at most three callback attempts and uses the installed MongoDB driver 6.20.0's 15-second whole-transaction timeout. Unknown commit outcomes are not reported as success or blindly replayed by application code. Errors are safe 409/503 responses; unexpected API logs contain identifiers rather than raw database/error messages.
7. **Notification gap:** post-commit best-effort queuing could omit a notification, and replaying checkout after later order revisions could enqueue a new placed message. When order emails are enabled, the existing durable outbox write now commits atomically with the business change. Duplicate/recovered actions do not enqueue another event. SMTP and R2 are never executed in retried database callbacks.

MongoDB distinguishes retrying the whole transaction after a transient failure from retrying only an uncertain commit ([official transaction documentation](https://www.mongodb.com/docs/drivers/node/v6.x/crud/transactions/)). The implementation retains that driver behavior and adds the attempt/time bounds; it does not implement a second application commit loop.

## Transaction and inventory guarantees

All commerce writes use the same testable service code in HTTP routes and isolated integration tests. Models, collection names, existing identifiers and financial state definitions are unchanged.

- Checkout validates the request, reads catalog eligibility/prices in a transaction snapshot, checks availability, updates the exact product/size/grind combination with revision/quantity conditions, inserts one uniquely keyed order and writes its enabled outbox entries. All commit together or all roll back.
- Product stock and the sum of variant stock must agree; duplicate variant identities, malformed stock, missing original variants and unsafe amounts fail closed instead of being guessed or repaired silently.
- Checkout cannot make target inventory negative. Restocking cannot exceed the existing per-variant 100,000-unit cap. A cap/inconsistency error leaves the order and all earlier restocks unchanged, requiring inventory review.
- Stock operations increment the product revision. The existing admin editor uses the same extracted revision-checked save operation, so a stale stock form cannot overwrite a reservation/restoration. An admin edit that wins first is observed by the retried checkout snapshot.
- Cancellation rereads the order inside the transaction, requires the submitted revision and an allowed transition, rejects collected/refunded history and protected proofs, changes the order to cancelled, restores all exact variants and writes its enabled outbox record atomically.
- The persisted cancelled state/revision is the one-time stock-release marker. Repeated manual/stale cancellations return a conflict; repeated expiration returns an unchanged/ineligible result. Neither can restore twice, including after a new service instance starts.
- A confirmation transaction updates both order and proof. An approval/rejection transaction updates both and records one timestamped payment event. A revision conflict or failed proof write rolls the complete operation back.
- Digital packing, shipping and delivery require verified payment. COD can become paid only after delivery and explicit approval. No refund, amount adjustment or automatic paid state was introduced.

These guarantees apply to writers following the services/admin revision contract. They cannot validate the accuracy of a human-entered physical stock count or protect against privileged direct database edits outside the application.

### Operational results and errors

- Business/revision/stock conflicts: 409, with a safe refresh/review instruction.
- Exhausted transient retry budget or temporary database unavailability: 503 (`DATABASE_BUSY`).
- Database write rejection: 503 (`DATABASE_WRITE_FAILED`), without raw driver text or personal data.
- Unconfirmed commit result: 503 (`TRANSACTION_UNCERTAIN`). Refresh the order or retry checkout with the **same** key; never assume a 503 proves the transaction did not commit, and never generate a replacement key solely because of that error.
- Recovered checkout: the existing order, `recovered:true`, with no new inventory reservation or placed-mail event. Recovery works when current shipping/payment configuration has subsequently become unavailable to the service.

The 15-second bound applies to the database transaction and commit retries. It is not a claim that the complete HTTP request, including catalog settings/auth or external R2 work, always finishes in 15 seconds. Duplicate-key recovery also has a bounded database lookup.

## Prepared expiration policy — disabled

No worker, timer, startup hook, cron, CLI processor, or HTTP expiration endpoint was added. `server/src/index.js` does not start expiration.

`expirationPolicy()` recognizes two environment variables without modifying either environment file:

| Variable | Default / validation |
|---|---|
| `UNPAID_ORDER_EXPIRATION_ENABLED` | Missing means false. Only literal `true`/`false` accepted. |
| `UNPAID_ORDER_EXPIRATION_MINUTES` | No default. If supplied, must be a positive whole-minute duration in the supported integer range. Enabling without a duration fails validation. |

Production configuration validation explicitly rejects activation until owner approval and a reviewed rollout. A future activation therefore requires an intentional code/configuration review, not merely adding a duration. The one-minute value in integration fixtures is a test condition, not a business recommendation.

The unscheduled service and bounded batch implementation are prepared as follows:

- Eligibility: InstaPay/Vodafone Cash; current unpaid/awaiting-transfer/rejected state; received/confirmed fulfillment; valid original `createdAt`; age at least the explicitly supplied duration.
- Anchor: creation time (`creation-v1`); rejection does not restart the window. This is a documented proposed policy, not an assertion of owner approval.
- Paid/refunded state or history is ineligible. Awaiting-verification, packed, shipped, delivered and cancelled orders are ineligible. COD is ineligible.
- Any submitted or approved proof for the order, even an unlinked legacy proof, protects it. A pending upload with an unexpired existing 15-minute upload window also defers expiration. No proof is deleted by expiration.
- Intent creation, proof confirmation, review, cancellation and expiration all write the same order under a transaction. Conflicting operations serialize/retry against fresh state; one cannot release stock while the other commits a protected payment/proof.
- Expiration sets fulfillment to cancelled and restores inventory in one transaction. It appends a timestamped cancelled fulfillment event and `paymentHistory.state='expired'` with a reason containing the policy, duration and original creation time. It does **not** invent a new current payment state or mark funds refunded.
- Repeated expiration sees persisted cancellation and changes nothing. The batch reads at most 50 candidate IDs and rechecks each in its own transaction. It stops on an error rather than pretending the batch succeeded.

No additional field or migration was required: existing timestamps, revisions, fulfillment states and free-form payment-history events support this preparation. Records without a usable creation date are not given a guessed deadline. Missing/altered original variants require manual reconciliation. Before activation, the owner must approve the duration, creation-based anchor, treatment of legacy orders and upload/rejection grace, plus scheduling/monitoring and batch progress policy. Protected old candidates can defer a bounded batch; no expiration timing SLA is promised.

Admin Overview remains byte-identical. It still counts only earliest recorded paid events as gross collections and treats refund/net amounts as unavailable. The new non-financial history events do not alter those definitions.

## Bounded limiter

The default store keeps at most **5,000 Map records and 5,000 heap entries**, with constant-size SHA-256 retained keys. Windows do not extend on blocked attempts, counts saturate, and expired entries are reclaimed on requests using the min-heap. There are no cleanup intervals or process-wide background resources.

At capacity, unseen buckets receive 429 and a positive, rounded-up `Retry-After` based on the earliest freeing entry. Existing buckets retain their allowance/history. Normal quota failures return the remaining window. Responses are no-store. Time moving backwards cannot reopen an active window.

Policies are isolated by middleware instance; rotating record IDs does not create new allowance. IPv4-mapped forms are normalized; IPv6 addresses share a canonical /64 identity. Shared IPs/subnets share limits. Invalid identities use one safe unknown bucket.

The limiter uses Express `req.ip`, never the leftmost forwarded header directly. The existing production `trust proxy=1` is preserved. Tests verify nearest-forwarded-address selection and resistance to spoofed prefixes. This assumes the actual deployment always passes through the expected trusted hop; [Express requires proxy configuration to match the real topology](https://expressjs.com/en/5x/guide/behind-proxies/). Live Render header/topology verification was not performed.

Limits reset on process restart and are independent per process. Horizontal scaling would multiply allowances; use a reviewed shared limiter before scaling. Capacity exhaustion can deny new legitimate clients until entries expire—this deliberate availability tradeoff prevents a capacity-based bypass. It is not a complete distributed abuse/DDoS solution.

## Files

Created:

- `server/src/commerce/transactions.js` — bounded transaction runner and safe database errors.
- `server/src/commerce/service-context.js` — model/clock binding, shared guards and transactional outbox integration.
- `server/src/commerce/inventory-service.js` — catalog loading, exact stock updates, consistency checks and shared admin revision save.
- `server/src/commerce/order-service.js` — checkout, fulfillment/cancellation and disabled expiration services.
- `server/src/commerce/payment-service.js` — serialized proof intents, confirmation and payment review.
- `server/src/commerce/expiration-policy.js` — disabled-by-default policy validation, without an invented duration.
- `server/test/commerce-transactions.test.js` — 25 actual replica-set scenarios.
- `server/test/commerce-safety.test.js` — policy, URI isolation, safe errors and HTTP checkout lock tests.
- `server/test/rate-limit.test.js` — limiter memory, clock, identity, middleware and proxy tests.
- `server/testing/isolated-commerce.js` — strict loopback replica-set/test-database guard and model setup.
- `server/testing/init-local-replica.js` — explicit initialization utility for only the dedicated loopback test node.
- `READ_ME_PHASE_C1_COMMERCE_SAFETY.md` — this report/setup guide.

Modified:

- `server/src/routes/commerce.routes.js` — hard lock before database access; call shared checkout/status services.
- `server/src/routes/payment.routes.js` — retain authorization and R2 validation; call shared payment services; remove unsafe replay shortcut.
- `server/src/routes/catalog.routes.js` — reuse the existing admin revision save via the extracted helper.
- `server/src/security/rate-limit.js` — bounded store and stable policy identities.
- `server/src/notifications/order-mail.js` — injectable model/config for existing durable outbox writes; ordered transactional operations.
- `server/src/config/production.js` — expiration-policy validation and activation prohibition.
- `server/src/app.js` — sanitized API error logging and safe actionable database errors.

No frontend, Admin Overview, existing browser tests, model schemas, dependency manifests, lockfiles, deployment files or environment examples were changed in C1. Entry hashes confirm those protected files are unchanged. `ORDERING_IMPLEMENTED = false` is unchanged and the real HTTP test proves setting `CHECKOUT_ENABLED=true` still cannot open checkout. Registration and noindex remain protected.

## Validation results

All final commands were actually run:

| Check | Passed | Failed | Skipped |
|---|---:|---:|---:|
| Entire backend, both MongoDB integration suites enabled | **96** | **0** | **0** |
| C1 real replica-set scenarios (subset of backend) | **25** | **0** | **0** |
| Rate-limiter tests (subset of backend) | **5** | **0** | **0** |
| Existing Overview tests (subset of backend) | **9** | **0** | **0** |
| Existing browser navigation/Overview/floating-toggle regressions | **53** | **0** | **0** |
| Root UI/SEO/static-head/HTML-audit tests | **23** | **0** | **0** |
| Prelaunch source checks | **18** | **0** | **0** |
| Built public HTML routes audited | **14** | **0** | **0** |

ESLint, production build/static-head generation and Git whitespace validation passed. The backend total includes the enclosing transaction-suite container in addition to its 25 scenarios; subset rows must not be added to the total.

The replica-set cases cover: concurrent last-unit purchasers; exact multi-variant decrement; mid-checkout rollback; duplicate and concurrent checkout keys; account/content conflicts; exact/repeated cancellation; partial-restoration rollback; cancellation/proof races; payment/cancellation races; proof replay; confirmation/approval rollback; repeated expiration across fresh service instances; protected pending/submitted proofs; new-intent/expiration races; database connection interruption; exhausted retry bounds; commit-only retry; concurrent admin stock edits; zero stock; digital fulfillment restrictions; COD collection; and transactional outbox failure.

Failures were injected into the real MongoDB server using app-name-scoped failpoints, including closing actual connections. No test mocks `mongoose.connection.transaction`. Initial real interruption tests reproduced the strict embedded-document rollback defect; the final run passes after the `insertMany` change.

Test evidence is in ignored `.playwright/c1-backend-all.txt`, `c1-browser-all.txt` and `c1-root-tests.txt`. No real customer information, R2 objects, SMTP deliveries or payment settings were used.

## Isolated local replica-set setup

Tested with MongoDB Community **8.0.16**, one replica-set member, on Windows. The local portable executable from the earlier work remains at `.playwright/mongo/bin/mongod.exe`; a separately installed Community `mongod.exe` can be used instead. No MongoDB package was added to the project.

From the repository root, start a **dedicated** test node in one terminal:

```powershell
New-Item -ItemType Directory -Force .playwright/mongo/c1-rs-data | Out-Null
.playwright/mongo/bin/mongod.exe --dbpath .playwright/mongo/c1-rs-data --bind_ip 127.0.0.1 --port 27029 --replSet qc-c1-rs --setParameter enableTestCommands=1 --logpath .playwright/mongo/c1-rs.log
```

In another terminal:

```powershell
node server/testing/init-local-replica.js
$env:QC_COMMERCE_TEST_MONGO_URI = 'mongodb://127.0.0.1:27029/?replicaSet=qc-c1-rs'
$env:QC_OVERVIEW_TEST_MONGO_URI = 'mongodb://127.0.0.1:27029'
npm.cmd test --prefix server
```

The initializer accepts no arguments and refuses a node whose configured replica name, bind address, port or test-command setting differs. The transaction test URI guard refuses Atlas, remote hosts, credentials, database paths (even existing test names), other replica identities and extra URI options **before connecting**. Connections are direct to loopback. Each run generates a fresh `qc_c1_test_<random>` name, verifies ownership before test writes/deletion and drops only that database in cleanup. The existing Overview suite uses its separate random test database. Failpoints apply only to the dedicated test client's app name.

Never enable test commands on a public or production MongoDB server. The disposable node's test-command option is used solely to prove transaction interruption/retry behavior. Stop this local node with Ctrl+C when finished. Ordinary backend runs explicitly skip the two MongoDB integration containers if their test-only variables are absent; the reported final 96-test run enabled both and skipped none.

Remaining checks:

```powershell
node --test tests/*.test.mjs
npm.cmd run lint --prefix client
npm.cmd run build --prefix client
node scripts/prelaunch-check.mjs
node scripts/audit-built-html.mjs
git diff --check
```

For the existing mocked browser suite, start Vite on loopback and use the already installed Playwright runtime:

```powershell
npm.cmd run dev --prefix client -- --port 5174 --strictPort
# Another terminal; optional if Playwright/Chromium are external to the repo:
# $env:PLAYWRIGHT_MODULE_PATH = 'C:/path/to/node_modules/playwright'
# $env:PLAYWRIGHT_CHROMIUM_EXECUTABLE = 'C:/path/to/chrome.exe'
node --test tests/browser/navigation.browser.mjs
```

The browser suite fulfills APIs in memory and blocks external traffic. It does not place real orders. The local application API was not started against Atlas for this phase.

## Remaining concerns / Phase C2

- Full amount-bearing refunds, partial refunds, returned stock policy, financial reconciliation and a proper collection/refund ledger remain C2. No funds are marked refunded by C1.
- Expiration still needs owner policy approval, an explicit production activation review, a scheduler/worker design, bounded-batch progress/monitoring and a legacy-order rollout decision. It is not automatically running.
- The existing mail worker is still at-least-once: a slow SMTP call, lease expiry or crash around delivery can duplicate mail. Transactional enqueue prevents business/outbox gaps, not exactly-once external delivery. Worker fencing/reconciliation remains separate work.
- R2 byte uploads/freezing, hosted cookies/proxy headers, SMTP delivery and production database latency were not integration-tested. Authentication/storage authorization and signature checks remain in the existing HTTP layer.
- The local single-member replica set proves real transactions, concurrency and transport interruption. It does not prove multi-node election/failover, multi-region behavior or production durability settings.
- Memory limits are process-local and reset on restart. Shared-state limiting is needed before horizontal scaling. Direct privileged database edits can still violate application invariants.
- Missing original variants, inconsistent summaries or full stock caps deliberately stop cancellation/expiry for manual reconciliation; no unsafe migration/guessing was attempted.

## Git review

No commit, push or deployment. Final status includes the pre-existing `.env.example` change; that file is excluded from the cumulative review patch at `.playwright/c1-review.patch`. Phase C1 changes seven existing files and creates twelve files, including this report.

```text
 M client/.env.example
 M server/src/app.js
 M server/src/config/production.js
 M server/src/notifications/order-mail.js
 M server/src/routes/catalog.routes.js
 M server/src/routes/commerce.routes.js
 M server/src/routes/payment.routes.js
 M server/src/security/rate-limit.js
?? READ_ME_PHASE_C1_COMMERCE_SAFETY.md
?? server/src/commerce/expiration-policy.js
?? server/src/commerce/inventory-service.js
?? server/src/commerce/order-service.js
?? server/src/commerce/payment-service.js
?? server/src/commerce/service-context.js
?? server/src/commerce/transactions.js
?? server/test/commerce-safety.test.js
?? server/test/commerce-transactions.test.js
?? server/test/rate-limit.test.js
?? server/testing/
```

Tracked diff summary (new untracked files are listed above):

```text
 client/.env.example                    |  4 --
 server/src/app.js                      |  6 ++-
 server/src/config/production.js        |  5 ++
 server/src/notifications/order-mail.js |  8 +--
 server/src/routes/catalog.routes.js    |  3 +-
 server/src/routes/commerce.routes.js   | 91 ++++++--------------------------
 server/src/routes/payment.routes.js    | 67 ++++--------------------
 server/src/security/rate-limit.js      | 94 ++++++++++++++++++++++++++++------
 8 files changed, 121 insertions(+), 157 deletions(-)
```
