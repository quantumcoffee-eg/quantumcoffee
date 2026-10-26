# Phase C3 — notification reliability and operational recovery

Base: C2 commit `6fa441c` on `main`. Implemented and verified locally; not deployed, staged, committed or pushed. No production Atlas/R2/Render connection, actual email transmission, environment edit or dependency installation occurred. The pre-existing `client/.env.example` edit is preserved byte-for-byte (SHA-256 `4D948F3FBE78254434D7EC3D621A0E6DC6C9BC568299941FF2D86766FA605B92`).

**Confirmed failure modes before editing**

- `notifications/order-mail.js` finalized by ID and sending state without an ownership token. An expired worker could overwrite a reclaimed message.
- A fixed 60-second lease had no absolute SMTP deadline. Slow delivery, restarts and ambiguous network failures could overlap recovery.
- A crashed sending record with five attempts could never be claimed again. Legacy records had no dispatch marker to distinguish unsent from possibly accepted mail.
- SMTP and post-send database failures shared a catch block. A failed database acknowledgement after acceptance could reset the job for an automatic duplicate send.
- All failures retried without distinguishing explicit temporary rejection, permanent rejection, bad configuration or unknown delivery outcome. Raw provider error codes/names were not allowlisted.
- The process did not stop claims/drain workers on SIGTERM. No admin outbox or storage diagnostics existed.
- C2's external refund-completion report did not validate the order-audit update result.
- Payment proof confirmation reused a deterministic copy destination. Concurrent confirmations or timeout retries could copy over a destination another request had attached. R2 and MongoDB cannot commit together.

**Lease and recovery protocol**

`mail-queue.js` owns atomic queue operations; `order-mail.js` owns scheduling/SMTP, and `mail-policy.js` owns fixed bounds and safe failure categories.

1. Claim a due pending job atomically, increment attempts, assign a fresh random token, mark claimed and lease for 60 seconds.
2. Validate message/recipient and monetary evidence. Before SMTP, atomically change claimed to dispatching with the same token and an unexpired lease. Require enough remaining time for send/finalization. This is intent to dispatch, not evidence of delivery.
3. Use a dedicated abortable SMTP socket with a 20-second absolute attempt deadline. SMTP is outside transactions. TLS is required and certificates remain verified.
4. Finalize only with matching ID, sending state, current token and unexpired lease. Majority writes and five-second operation bounds apply. A failed database acknowledgement retries only finalization, at most twice; it never repeats SMTP. An already committed update is recognized by its token/state/time.
5. Recover expired work by atomically obtaining a **new recovery token** before changing state. Known claimed-but-undispatched work becomes pending with backoff, or dead if exhausted. Dispatching, legacy/unphased or interrupted-recovery work becomes uncertain and is not automatically resent. Old tokens cannot finalize or reset it.

Normal leases are deliberately longer than bounded sends; renewal/heartbeat timers are unnecessary. A long process pause, clock change or lost ownership still fails closed. External SMTP cannot validate our MongoDB fencing token, so expiry cannot cancel an acceptance that already happened; quarantine prevents another C3 worker from blindly resending that ambiguous dispatch.

One instance processes at most five messages serially per batch, at most five expired leases and five exhausted pending records per recovery pass. Polling occurs two minutes after completion, without overlapping batches. A stopped instance starts no new claims. Disabled/unconfigured mode creates no timer or transport and performs no worker DB work. State survives process restarts in MongoDB; no local disk queue is used.

Five attempts maximum. Backoff is 30 seconds times two to the attempt-minus-one, capped at one hour; actual retry also waits for polling. Explicit SMTP 4xx responses (including temporary auth responses) retry. SMTP 5xx and non-temporary authentication failures dead-letter. Known connection-stage failures retry. DATA/socket/timeout or otherwise ambiguous results become uncertain. Missing/invalid monetary evidence becomes an integrity dead-letter before transmission. Stored/logged errors are fixed categories, never provider responses or credentials.

**Honest delivery semantics and idempotency**

Sent means the simulated/real SMTP adapter returned affirmative acceptance for the intended recipient and MongoDB recorded it. It does not establish inbox delivery, spam classification, later bounce or recipient reading.

This is a bounded-attempt queue with uncertainty quarantine, **not exactly-once SMTP and not an unconditional at-least-once delivery promise**. Known transient failures may be attempted repeatedly. Ambiguous dispatches deliberately require review instead of promising eventual automatic delivery. Provider behavior, out-of-band sends or a future authorized replay can still produce duplicates. Stable Message-ID/X-Quantum-Notification headers help trace attempts; they cannot force provider deduplication.

Messages describe their recorded business-event snapshots. Delivery order across workers or retries is not guaranteed; a later event may arrive first. The tracking/admin order and ledger remain authoritative for current state.

New messages persist a stable Message-ID derived from their opaque notification identity and public-site hostname. Legacy pending records without an ID use a deterministic fallback. Earlier pre-C3 provider-generated IDs cannot be reconstructed. Monetary messages dedupe by ledger event and audience, across revisions or changed recipient input; immutable original recipient data is not retargeted. Other business notifications retain C1's dedupe identity. Unique event/audience and existing dedupe-key indexes enforce the journal-to-notification relationship. Legacy C2 monetary rows remain usable via verified event/order-number matching without an orderId backfill.

Enqueueing still requires the business transaction. Collections/refunds check real event ID, kind, amount, order identity/total, and applicable recorded refund case inside that transaction and again before sending. Collection/refund text uses the verified amount. Recovery never recreates an order, changes inventory, reverses a collection or manufactures a refund. C2 refund/correction recording remains disabled.

**Shutdown and runtime readiness**

`shutdown.js` handles SIGTERM/SIGINT idempotently: stop new HTTP work/queue claims, drain active work, then disconnect MongoDB. A 25-second deadline aborts SMTP, closes remaining HTTP connections and exits nonzero if draining cannot finish; the lease remains recoverable. Startup logs only a fixed stage instead of raw database/configuration exception text. Runtime DB failures pause processing; later polls resume when connected.

The committed Render blueprint remains one Starter instance with manual deployment and email/checkout/registration disabled. Its configuration was inspected, not live infrastructure. C3 workers coordinate through MongoDB even during overlapping starts, but the C1 in-memory HTTP limiter still assumes a single instance. Additional instances multiply polling/provider load and require a separate capacity/rate-limit review.

Render documents SIGTERM followed by a default 30-second shutdown window in its [deployment/shutdown documentation](https://render.com/docs/deploys#graceful-shutdown). The shorter local deadline leaves a margin; no Render setting was changed. Before a future rollout/activation, keep sending disabled, quiesce old C1/C2 worker binaries and review new indexes; old binaries do not implement C3 fencing.

Nodemailer configuration validates port/TLS/origin/sender/header values and requires authenticated, certificate-validated TLS. Port 465 uses implicit TLS; 587 uses STARTTLS. Configuration-ready does not verify credentials or provider reachability. Existing username/password configuration is not an OAuth integration. Gmail's ordinary password/legacy less-secure-app flow is not a launch solution: see [Nodemailer's Gmail guide](https://nodemailer.com/guides/using-gmail) and [Google's app-password requirements](https://support.google.com/accounts/answer/185833). Provider/authentication choice, authorized sender identity, DNS/deliverability, quotas and a controlled external smoke test remain owner decisions. No such test or credential change was performed.

**Read-only operational monitoring**

`GET /api/admin/overview/operations` uses the existing admin session/role guard, no-store header and rate limit, rejects query parameters and supports GET only. Three aggregations have five-second server/client bounds. Output is an explicit count/time/boolean projection with no recipient address, body, private storage key, provider response or credential.

The Overview panel loads independently of financial Overview success and offers refresh only. It displays pending/dead/uncertain/stuck counts, last SMTP acceptance and last processed attempt, disabled/unconfigured/ready explanation and upload diagnostics. English/Arabic, keyboard operation and narrow layouts were tested. No resend, cleanup, settings mutation or replay control exists.

Storage figures identify database-backed candidates only: expired upload intentions, known unattached copies, unresolved copy attempts and verified images not attached to products. Fifteen minutes is the existing upload-intent/diagnostic window, **not an approved deletion/retention period**. A pending intention does not establish that bytes were uploaded; an unattached verified image may be intentionally awaiting use. No live bucket inventory is scanned, so objects without DB metadata cannot be enumerated by this report.

**Proof-copy recovery**

Before copying, a transaction validates the pending order/proof, serializes on order revision, allocates a unique private destination and records the attempt. At most five attempts per proof are retained. A copied timestamp is recorded after signature/size inspection; confirmation may attach only the selected candidate. Old callbacks/late copies target their own keys and cannot overwrite another attempt's referenced object. The existing submitted-proof retry returns recovered without another copy. Legacy submitted proof references remain valid.

Private R2 SDK automatic retries are disabled for this flow so an ambiguous copy is not reissued to a previously used destination. Client retry uses a fresh destination. The next attempt may supersede an earlier successful but unattached copy, which is retained for review. No storage object is deleted. If a copy completes but DB recording fails, its pre-recorded attempt remains unresolved; diagnostics/runbook explain the uncertainty instead of marking the proof paid or removing evidence.

The C2 refund report now reads the order, uses its revision in the audit update and requires exactly one modification. A missing/stale audit write aborts the whole transaction, including the case update. An isolated test induces a real zero-match and confirms rollback. No refund action was activated.

**Operational runbook — read-only diagnosis now**

| Situation | Safe interpretation and response |
| --- | --- |
| Order committed, mail pending/dead | Keep the original order/idempotency key. Inspect health/provider configuration; never create another order to trigger mail. |
| Payment collected, notification delayed | Trust the verified ledger and reconciliation, not email delivery. Retry/recover the original business request only with its original reference/revision. Do not approve again to trigger mail. |
| Refund recorded, notification fails | Money recording and notification state are separate. Inspect the existing event/outbox; never record another refund or initiate a transfer to fix mail. Live refund recording stays disabled. |
| Claimed worker crashes before dispatch | After expiry, C3 safely requeues with backoff while attempts remain. No operator write is needed. |
| Dispatch/acceptance/final-ack uncertain | Job is held. Use provider-side evidence and Message-ID/time, not an assumption that a failed HTTP/DB response means no email. Do not set pending manually. |
| Dead/permanent/auth/integrity failure | Review fixed failure category and configuration/ledger evidence. Fixing configuration does not replay terminal jobs. No replay endpoint exists. |
| Stuck lease | Check DB readiness and processor/restart logs; allow a connected enabled C3 worker's bounded recovery pass. Disabled mode intentionally performs no recovery writes. Legacy/corrupt data requires authorized review, never a bulk reset. |
| R2 copy succeeded, DB confirmation failed | Retry the original proof confirmation while eligible. A new bounded destination is used; existing evidence is not overwritten. Review unresolved attempts. Do not approve a screenshot as cash received. |
| Image/proof candidate orphan | Confirm references, private/public bucket scope and retention obligations before any future owner-authorized inventory/cleanup. Counts alone are insufficient. This phase performs no R2 listing/deletion. |
| Customer retries after timeout | Reuse checkout key/payload or original proof/order reference. C1/C2 recovery prevents extra stock reservations, collections and eligible queue records. HTTP checkout remains hard-disabled. |

Authorized database investigation can project job ID, order number, state, phase, attempt count, Message-ID and timestamps, bounded to a small page. Do not export to/body/provider text or use raw production credentials in commands/logs. This task includes no production query/replay/cleanup script.

**Proposed future manual replay process — not implemented/enabled**

Require an authenticated authorized operator, unique replay-request ID, reason and provider evidence. Independently review ambiguous acceptance and recipient authorization; revalidate the original business/ledger event. Accepted messages should be resolved without resending. A definitively undelivered message may receive a separately approved, bounded replay authorization with an append-only audit, actor/reviewer/time, preserved original content/recipient and idempotent fenced transition. Define cycle/retention limits first. Never bulk-reset states, clear attempts or automatically resend uncertain financial messages. No database write API for this workflow is present.

**Exact changed files**

Created:

- `server/src/notifications/mail-policy.js`: attempt, lease, deadline, backoff and sanitized classification rules.
- `server/src/notifications/mail-queue.js`: atomic fenced claim/dispatch/finalization/recovery.
- `server/src/notifications/mail-integrity.js`: ledger-backed monetary notification verification.
- `server/src/admin/operations-service.js`: bounded count-only mail/proof/media diagnostics.
- `server/src/shutdown.js`: bounded, idempotent shutdown lifecycle.
- `client/src/admin/OperationsHealth.jsx`: operational monitoring UI.
- `client/src/admin/operations-copy.js`: bilingual operational language.
- `server/test/notification-integration.test.js`: real disposable MongoDB recovery/concurrency tests.
- `server/test/notification.test.js`: policy/configuration/privacy/access/shutdown/transport tests.
- `READ_ME_PHASE_C3_NOTIFICATION_RECOVERY.md`: this report and runbook.

Modified:

- `server/src/notifications/order-mail.js`: orchestrator, transactional enqueueing and bounded scheduler.
- `server/src/notifications/order-mail-values.js`: validated configuration, stable identities and financial-event dedupe.
- `server/src/notifications/order-mail-content.js`: correct verified collection amount.
- `server/src/models/OrderMail.js`: fencing/phase/status/trace fields and queue/event indexes.
- `server/src/commerce/service-context.js`: injected models for transactional mail verification.
- `server/src/commerce/payment-service.js`: bounded proof copy tracking and selected-candidate attachment.
- `server/src/models/PaymentProof.js`: bounded copy-attempt metadata.
- `server/src/routes/payment.routes.js`: unique copy destination/audit orchestration.
- `server/src/payments/private-r2.js`: no automatic retry of ambiguous copy operations.
- `server/src/accounting/refund-foundation.js`: checked revision/audit update and rollback.
- `server/src/routes/overview.routes.js`: protected operations endpoint.
- `server/src/mailer.js`: owned abortable socket and mandatory certificate-validated TLS.
- `server/src/index.js`: graceful shutdown and safe startup/error logging.
- `server/testing/isolated-commerce.js`: isolated MediaAsset test model.
- `server/test/commerce-transactions.test.js`, `server/test/accounting-transactions.test.js`: synthetic public origin needed for stable queued IDs; no credentials or real SMTP.
- `client/src/admin/AdminOverview.jsx`, `client/src/admin/admin-overview.css`: independent responsive operations panel.
- `tests/browser/overview-fixtures.mjs`, `tests/browser/navigation.browser.mjs`: offline health fixtures and four new English/Arabic browser cases.

No package/lockfile, `.env`, `.env.example`, public storefront, floating language switcher, SVG flag, C1 transaction/inventory helper, financial reporting aggregation, Render blueprint or noindex configuration was changed. The owner's `.env.example` modification is outside C3.

**Schema/index rollout and limitations**

New OrderMail fields are additive; legacy pending mail still processes, and expired legacy sending rows are conservatively quarantined. New state is uncertain. New indexes: `{state,lockUntil}` and unique `{monetaryEventId,audience}` partial on ObjectId monetary references. Existing dedupe, pending-time and sent TTL indexes remain. Latent duplicates must be reviewed before future index creation; never delete them automatically. PaymentProof adds candidate/copy-attempt metadata with legacy-reference compatibility. No production migration or backfill was run.

Existing sent-job 90-day TTL behavior is retained; dead/uncertain records have no automatic TTL. Owner retention approval remains necessary. Observed last-success history is therefore bounded by retained records. Read-only aggregates scan retained metadata with fixed execution bounds; they are not a live worker heartbeat, provider credential probe, bank reconciliation or complete R2 inventory. No performance claim is made about production Atlas volume. Actual provider delivery, TLS interoperability/credentials, R2 behavior and Render signal timing still require a later separately authorized environment smoke test.

**Executed validation**

| Check | Final result |
| --- | --- |
| Complete backend with both isolated Mongo test URIs | **157 passed, 0 failed, 0 skipped**. Includes existing C1/C2/Overview suites. |
| New real MongoDB C3 suite (within total) | **23 passed**: 22 scenarios plus parent; competing workers, slow/expired sends, pre/post-dispatch crashes, post-acceptance DB failure, uncertain final acknowledgement, stale ownership, retries/dead letters/restarts, shutdown/disabled modes, monetary uniqueness/amounts, privacy/diagnostics, unique proof copies, copy-audit interruption/bounds and refund-audit rollback. |
| New policy/API/transport/shutdown tests (within total) | **8 passed**. |
| Complete offline Chromium suite | **62 passed, 0 failed, 0 skipped** (58 existing plus four C3 cases). |
| SEO/source tests | **23 passed, 0 failed, 0 skipped**. |
| Frontend lint / production build | Passed; 14 prelaunch public HTML heads generated. |
| Prelaunch / built HTML / whitespace | **18 source checks**, **14 HTML routes**, and Git whitespace passed. |
| Server dependency audit | **0 vulnerabilities**, all severity counts zero. |
| Client dependency audit | **0 vulnerabilities**, all severity counts zero. |
| Visual inspection | English desktop and Arabic 320px panel inspected; no horizontal overflow or clipped controls. |

Tests ran only on MongoDB 8.0.16 at `127.0.0.1:27029`, set `qc-c1-rs`, in uniquely named disposable databases guarded against Atlas, remote hosts, authentication and existing database paths. SMTP acceptance and R2 copies were simulated. Crash windows were exercised through abandoned real leases and MongoDB failpoints, not by claiming a real provider delivered or terminating a production worker. TLS socket/configuration tests used a mocked transport and opened no provider connection.

An initial browser run found the operational timestamp list reused an accounting-specific class; it was separated and all 62 tests passed on rerun. Audit output initially required PowerShell UTF-16 decoding; the actual npm audits completed with exit zero and parsed reports confirm zero vulnerabilities. No audit fix/install was applied.

Artifacts under ignored `.playwright/`: `c3-backend-all.txt`, `c3-browser.txt`, `c3-seo.txt`, `c3-server-audit.json`, `c3-client-audit.json`, `c3-operations-en.png`, `c3-operations-ar.png`, `c3-review.diff`, `c3-git-status.txt`.

**Local reproduction and manual verification**

Use C1's documented dedicated local replica set (never application/Atlas environment variables). Start it in a separate repository-root terminal:

```powershell
.playwright/mongo/bin/mongod.exe --dbpath .playwright/mongo/c1-rs-data --bind_ip 127.0.0.1 --port 27029 --replSet qc-c1-rs --setParameter enableTestCommands=1 --logpath .playwright/mongo/c1-rs.log
```

Then from the repository root:

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

Start local Vite separately: `npm.cmd --prefix client run dev -- --port 5174 --strictPort`. Existing cached Playwright on this workstation:

```powershell
$env:PLAYWRIGHT_MODULE_PATH='C:/Users/youss/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright'
$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE='C:/Users/youss/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe'
node --test tests/browser/navigation.browser.mjs
npm.cmd --prefix server audit --registry=https://registry.npmjs.org
npm.cmd --prefix client audit --registry=https://registry.npmjs.org
```

Inspect the captured panel screenshots and browser results. With an approved isolated/local admin session, open `/admin`, inspect Notification & storage health and refresh; repeat `/ar/admin` at 320/390px and desktop. Confirm labels, zero/disabled data, timestamps, keyboard focus, no replay/delete buttons, preserved accounting/other tabs and floating toggle. The offline tests cover loading, unavailable/retry, unconfigured and populated states without actual services. Do not launch the normal server with an Atlas-backed `.env` as a test setup or trigger any email/refund/cleanup.

Remaining owner work: approve provider/authentication/sender and limits; independently authorize a controlled SMTP/R2/Render smoke test; review index rollout/legacy uncertain jobs; approve mail/evidence retention and any replay/cleanup workflow. Refund/correction policies remain outstanding from C2.

**Git handoff**

All C3 edits are uncommitted on `main`; no staging or push. The complete ignored review diff includes new files and excludes the owner's `.env.example` edit. Git status and the detailed diff summary are captured alongside it. All launch/service flags remain disabled and no production action was taken.
