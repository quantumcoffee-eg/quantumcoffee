# Quantum Coffee — owner and developer readiness matrix

27 October 2026. **Repository preparation only. No deployment or launch authorization.** All example hostnames below use `.example.invalid`; they are placeholders, not Quantum Coffee configuration. Follow `READ_ME_PHASE_D2_READINESS.md` for measured findings and exact local test results.

## Readiness matrix

| Area | State | Evidence / next responsible action | Launch significance |
| --- | --- | --- | --- |
| Public EN/AR navigation, cart selection, route guards | Implemented; verified locally with fixtures | Existing + D1/D2 browser regressions; developer must repeat against owner staging | Ready to configure; deployed acceptance still required |
| Admin Overview, ledger, orders/catalog/settings, reconciliation, health | Implemented; verified locally | Real local replica-set tests; read-only diagnostics; explicit error states | Ready to configure; not a claim about live data |
| Transactions, stock restoration, duplicate actions and payment races | Implemented; verified in disposable local DBs | C1/C2/C3 integration groups remain enabled in validation | Mandatory staging/controlled workflow check before ordering |
| Notification outbox, fencing, uncertain delivery recovery | Implemented; sending disabled | Mock SMTP acceptance and real local MongoDB lease/concurrency tests | Sender configuration and authorized provider tests are blockers |
| Checkout, registration, refund/correction recording, expiration, SMTP | Disabled / not authorized | Existing source/config locks and prelaunch checker | Must remain closed until individually approved |
| Fourteen public HTML heads, language metadata, noindex | Implemented; verified on build artifacts | Native Pages fallback preparation; no public sitemap or live Product offers | Indexing remains blocked intentionally |
| Product-specific crawlable HTML / social previews | Prepared renderer/design only | Developer must wire an approved published catalog export or reviewed HTML-at-request adapter | Blocker to an SEO-ready product launch, not to protected staging |
| Forced colors, keyboard, zoom, RTL, reduced motion | Targeted local checks | Chromium/Edge checks and actual 200% browser zoom; manual AT/physical devices remain | Manual acceptance required; no WCAG certification |
| Domain, DNS, SSL, final CORS/cookies/media origins | Not configured or verified by D2 | Owner supplies approved domain/accounts; developer validates topology | Deployment/integration blocker |
| Real product content, media, policies, rates and receivers | Pending owner approval | See owner checklist below | Commerce launch blocker |

## Owner supplies and approves

These are business decisions; do not fill them with guessed defaults.

- [ ] Final canonical domain and whether apex or `www` is primary; authority over registrar/DNS and existing mail records.
- [ ] Approved bilingual product/category names and descriptions, permanent slugs, prices in EGP, bag sizes and grind preparations.
- [ ] Inventory for each exact product + size + grind; confirmation of what should be published and featured.
- [ ] Product/category images, rights to use them, preferred ordering/cover images and final sharing image.
- [ ] Shipping coverage, rates, exceptions and delivery wording. Blank rates remain unconfigured.
- [ ] Approved payment methods and precise receiver details; independent verification instructions for digital receipts and COD collection.
- [ ] Public WhatsApp, contact email, Instagram and other approved business details.
- [ ] English/Arabic shipping, privacy, terms, returns/refund and contact wording; legal/business approval belongs to the owner.
- [ ] Refund process: who requests, externally performs, reports and separately verifies a refund; what evidence/reference is acceptable; stock decisions independent of money. Recording/execution remains disabled.
- [ ] Any unpaid digital payment window and expiration authorization. No duration or worker activation is assumed.
- [ ] Data retention, backup/export frequency, access, deletion, R2 orphan review/retention, email retention and recovery expectations.
- [ ] Quantum-only account ownership, billing approval and developer access grants. Do not reuse another client's accounts, buckets, secrets or database.

## Developer infrastructure checklist — only after account authorization

### Domain and topology

- [ ] Inventory existing DNS, MX, SPF, DKIM, DMARC and verification TXT before any domain changes; preserve business email.
- [ ] Select the canonical frontend origin; redirect the alternate hostname once, retaining path/query. Test no redirect loops and HTTPS certificates.
- [ ] Prefer a same-site HTTPS frontend/API arrangement, for example `shop.example.invalid` + `api.example.invalid`. Provider `pages.dev` and `onrender.com` addresses are cross-site: the existing `SameSite=Lax` cookie is not a supported cross-site login solution.
- [ ] Set `PUBLIC_SITE_ORIGIN` and exact comma-separated `CLIENT_ORIGIN`; set frontend `VITE_PUBLIC_SITE_ORIGIN` and `VITE_API_BASE_URL` at build time. VITE variables are public: never put credentials there.
- [ ] Verify credentialed requests from the browser, host-only Secure/HttpOnly/Lax session cookie, login/logout/reload and CSRF origin rejection. Do not weaken cookie/CORS policy merely to make provider preview domains work.
- [ ] Verify actual Render proxy hop/IP behavior. Current production Express policy trusts one final hop. If Cloudflare is added in front of the API, review that topology first; do not blindly trust arbitrary forwarded addresses.

### Cloudflare Pages

- [ ] In the owner's Quantum project, use the owner repository and manual deployment approval. D2 did not create or modify a Pages project.
- [ ] Repository-root build option: `npm --prefix client ci && npm --prefix client run build`, output `client/dist`. Alternatively set root `client`, build `npm ci && npm run build`, output `dist`; do not mix the two path conventions. The build needs access to the repository's sibling `scripts` directory.
- [ ] Use the tested Node major with an explicitly reviewed current patch release; repeat lockfile installs/build in the selected provider environment.
- [ ] Verify fourteen static heads are served at their intended extensionless routes. Non-home heads use flat `.html` files for Pages' clean URLs; Arabic home retains `ar/index.html`. Native SPA fallback handles unknown client routes without a top-level `404.html`.
- [ ] Do not reinstate `/* /index.html 200`: it masks route heads/special files. Do not add a top-level 404 until the routing architecture provides an equivalent SPA fallback.
- [ ] Check all public/private/nested response headers: noindex/nofollow, frame denial, nosniff, referrer and permissions policy. `_headers` does not automatically cover future Functions or Render responses.
- [ ] Keep HTML revalidating; retain immutable caching only for Vite's content-hashed `/assets/*`. Do not cache API responses or set a blanket “cache everything” rule. Hero/logo filenames are not content-hashed; do not give them indefinite immutable caching.
- [ ] The new `robots.txt` serves real policy text instead of SPA HTML. Its empty Disallow preserves the previous default crawl access so bots can read the still-mandatory HTML/header noindex directives. It advertises no sitemap and does not authorize indexing; robots exclusion alone is not an indexing/privacy control.
- [ ] Review the candidate CSP using final exact API/media/private-storage origins. Start with Report-Only in an authorized environment; verify fonts, chunks, product media, private proof views and direct uploads before any enforcement. The candidate is **not enabled** by D2.

### Render

- [ ] Review `render.yaml`: owner repo, `main`, `server` root, `npm ci`, `npm start`, Frankfurt proposal, Starter proposal, `/api/ready`, automatic deploys off. Creating paid resources requires owner billing approval.
- [ ] Configure secrets through the owner's provider secret store. Keep actual environment files out of Git and logs.
- [ ] Keep `CHECKOUT_ENABLED`, `REGISTRATION_ENABLED`, `ORDER_EMAILS_ENABLED`, `ALLOW_ADMIN_BOOTSTRAP` and expiration flags false. Keep refund/correction recording disabled in source. Do not use bootstrap or seed scripts on the service.
- [ ] Verify startup fails closed for invalid production settings or unavailable DB; `/api/ready` must be 503 when disconnected and 200 when usable. `/api/health` alone is not deployment readiness.
- [ ] Verify clean SIGTERM shutdown, in-flight requests and worker drain before Render's shutdown delay. App's existing 25-second deadline is below the documented default provider delay; verify configured values in the actual service.
- [ ] Measure real RSS, CPU, event-loop latency, DB pool waits, request percentiles, timeouts, errors and outbox lag. D2 local numbers do not establish Render capacity or bandwidth.
- [ ] Keep one instance initially subject to measured demand. The in-memory limiter is per process; restarts reset it and deploy overlap/multiple replicas can multiply allowances. Review shared/gateway limiting before horizontal scaling. Mongo lease fencing does not make the HTTP limiter distributed.
- [ ] Reassess scale for sustained saturation, pool timeouts, long admin reports, outbox lag, memory pressure or availability requirements. Do not increase plans or create a paid queue without owner approval and measurements.

### MongoDB Atlas

- [ ] Confirm the owner's dedicated database/user and least-privilege permissions; production DB name remains `quantumcoffee_production`. Do not point local test tools at Atlas.
- [ ] Allowlist current authorized Render outbound ranges; do not use a permanent `0.0.0.0/0` database allowlist. Verify TLS and a working manual backup/export and restore plan appropriate to owner requirements.
- [ ] Inspect actual existing indexes before starting a new deployment. Unique checkout keys, order references, session hashes, ledger event keys/collection constraints, external refund references and notification dedupe/fencing indexes are correctness requirements.
- [ ] Current Mongoose startup can manage schema indexes. Do not disable auto-indexing until all required indexes are provisioned/verified. Do not add D2 candidate indexes to models as an implicit startup migration.
- [ ] Review the measured optional index candidates in the D2 report against the real query mix/volume. Export/backup first, inspect duplicate data where relevant, schedule reviewed index creation, measure `explain`, and record rollback before any production migration. No candidate was applied by D2.
- [ ] Confirm Atlas connection/throughput/storage limits, pool waits and financial/reconciliation query times under authorized real workload. Full-history diagnostics are bounded in time/output, not constant work as data grows.

### R2 and media

- [ ] Create/connect only owner-authorized Quantum resources: separate public catalog bucket and private proof bucket. No private public-domain or `r2.dev` access. `privateR2Ready` rejects using the same named public/private bucket.
- [ ] Configure account ID, scoped access key/secret, exact bucket names and public custom media origin on the server. Never expose storage credentials to Vite. Avoid production use of the public development URL.
- [ ] Configure bucket CORS with exact approved frontend origins and `PUT` / `Content-Type` for direct uploads; public image GET and any required HEAD rules should be minimal. No credentialed wildcard policy. Test preflight in-browser.
- [ ] Verify current public upload signing (90 seconds), private proof upload signing (90 seconds), admin view signing (60 seconds) and proof intent confirmation window (15 minutes). These are existing technical limits, not the unpaid-order expiration policy.
- [ ] Check signed `Content-Type`, declared versus actual size, supported JPEG/PNG/WebP signatures, 5 MB limit and product gallery limit 24. Signature checking is not full decoding, malware scanning, pixel validation or lossless re-encoding. Review actual owner images and any future broader upload threat model before expanding access.
- [ ] Verify ordinary public images load directly from the media domain; API confirmation uses HEAD + a 32-byte range GET. Proof confirmation additionally freezes and re-inspects an immutable copy. Do not remove those calls merely to reduce request counts.
- [ ] Private signed views and API responses must remain no-store; no shared cache of proof URLs. Verify the private bucket cannot be accessed without signed/authenticated authorization.
- [ ] Review diagnostics: expired intent/freeze records and unattached verified media are DB metadata signals, **not** a full R2 object inventory. Category and product attachments are both accounted for after D2.
- [ ] No automatic object deletion. An authorized future cleanup requires explicit retention policy, object inventory, owner review, backup/evidence, attachment recheck and an auditable deletion procedure.

### Email and operations

- [ ] Select/authorize the sender/provider. Configure SMTP credentials, MAIL_FROM/reply-to, TLS and provider limits only in the owner's secret store; verify SPF/DKIM/DMARC and domain authorization.
- [ ] Perform an explicitly authorized delivery test to approved addresses. Mock SMTP acceptance in local tests is not real inbox delivery. Do not enable `ORDER_EMAILS_ENABLED` just to make a health panel green.
- [ ] Exercise pending/dead/uncertain/stuck visibility and restart handling. A crash after SMTP acceptance can leave an uncertain delivery; stable Message-ID is traceability, not universal duplicate prevention.
- [ ] Define manual, auditable reconciliation/retry authority before adding replay controls. Keep currently disabled refund/expiration/email activation decisions separate.

## Controlled launch sequence and evidence to retain

| Gate | Responsible party | Required evidence |
| --- | --- | --- |
| Isolated provider staging | Developer + owner account access | Domain/TLS/CORS/cookies/headers, build SHA, all closed flags, no production test mutations |
| Real media integration | Developer + owner-approved assets | Authorized upload/confirm/attach, byte/size failures, CORS, gallery ordering, private denial and signed expiry |
| Authorized sender | Owner authorizes; developer verifies | Provider acceptance + delivered message to approved address, sanitized logs and disabled-mode recovery |
| Database/performance | Developer, approved database scope | Index inventory/explain, pool/report timings, backup/restore plan, no fake live accounting |
| Commerce rehearsal | Owner explicitly approves isolated/controlled test data | Last-unit race, idempotency, cancellation, proof submission/review, COD collection, ledger/outbox consistency |
| Refund/expiration policy | Owner | Approved real-world process/window and separate implementation/activation review; no assumed activation |
| Owner acceptance | Owner | Desktop/mobile EN/AR, correct catalog/policies/rates/receivers, prices/stock and admin workflow sign-off |
| Product SEO readiness | Developer + owner content/domain | Non-JS product HTML/body, real 404 behavior, canonical/hreflang/OG preview, no private/draft output |
| Indexing authorization | Owner expressly approves | Search Console, sitemap review and a separate reviewed change to noindex/robots/headers; never flip one layer alone |
| Checkout authorization | Owner expressly approves after all gates | Separate reviewed removal of the hard lock and controlled go-live/rollback plan; no implicit release by configuring accounts |

Keep the last good build and a verified rollback path. DNS, index, credential, sender, data and commerce changes require their own approval and validation; rollback of application code does not undo external transfers or database writes.

## Optional improvements versus blockers

Optional at the current tiny catalog: additional sort/media/history indexes, advanced search infrastructure, broader chart/code splitting, font self-hosting/subsetting after license/appearance review, shared rate limiting before actual multi-instance demand, and further animation tuning. Investigate only with evidence; none requires a new paid service now.

Blockers to public commerce remain owner content/policies/prices/inventory/rates/receiver approval, configured and verified Quantum infrastructure, real cookie/CORS/media/email/transaction acceptance tests, backup/retention decisions, and explicit checkout authorization. SEO-ready product launch also needs a real product HTML architecture and indexing approval. Physical-device and screen-reader acceptance are outstanding checks; this phase is not a WCAG or launch certification.

## Expected recurring cost categories

No current account billing or dollar total was inspected or invented. Owner should review current provider allowances and approve:

- Render API compute plan and any future added service/instance; optional extra logging/monitoring retention.
- Domain renewal/registrar charges, any chosen DNS/security/CDN plan and SSL arrangement.
- Cloudflare Pages build/request/asset allowances or any future Pages Functions/Workers usage; R2 storage, Class A/B operations and any applicable delivery/processing products.
- MongoDB Atlas storage/connections/throughput tier, optional search/backups and manual export/restore storage.
- Email mailbox/provider subscription, authorized sending volume/limits and domain authentication management.
- Operational backup storage, retention, incident recovery and maintenance effort as approved by the owner.

Official configuration references: [Pages serving behavior](https://developers.cloudflare.com/pages/configuration/serving-pages/), [Pages headers](https://developers.cloudflare.com/pages/configuration/headers/), [R2 signed URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/), [R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/), [Render Blueprint reference](https://render.com/docs/blueprint-spec), [Render shutdown](https://render.com/docs/deploys#graceful-shutdown), [Express proxy trust](https://expressjs.com/en/guide/behind-proxies/). No connected cloud accounts were used.
