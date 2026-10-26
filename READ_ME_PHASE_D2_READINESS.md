# Phase D2 — technical readiness, SEO and performance

Reviewed locally on 27 October 2026, on `main` based on committed D1 `e4e77fd`.

## Result and boundary

This is repository preparation for owner integration, **not a deployment or commerce launch approval**. The exact owner/developer readiness matrix, blockers, recurring cost categories and controlled launch sequence are in [PHASE_D2_OWNER_HANDOFF.md](PHASE_D2_OWNER_HANDOFF.md).

At inspection the only pending change was the owner's `client/.env.example` edit. Its SHA-256 remains `4D948F3FBE78254434D7EC3D621A0E6DC6C9BC568299941FF2D86766FA605B92`. D2 did not edit `.env` or `.env.example`, add dependencies, change models/index declarations, alter ledger/transaction/inventory/payment semantics, use production Atlas/R2/Render/Pages, send mail/payments, enable any service/commerce flag, remove noindex, stage, commit, push or deploy.

The only external resources exercised were official documentation, npm's read-only advisory endpoint, and explicitly allowlisted public Google Font hosts. Browser APIs otherwise use fixtures; database tests/benchmarks refuse remote/authenticated/production URI targets.

## Investigation, decisions and implemented changes

| Confirmed finding | Evidence / affected files | Decision |
| --- | --- | --- |
| Startup width reads force layout | Fresh production CPU/Long Animation Frame profile attributed one mobile Home sample's 218 ms forced-layout work to `AnnouncementBar`'s width measurement. Its minified function and offsets were mapped back to the source, rather than assuming GSAP was the cause. | An observer-only sizing experiment increased cold loading costs and was rejected. Preserve the working synchronous sizing and continuous loop; apply fixed-bar CSS containment. Do not claim the remaining startup long task is eliminated. |
| Scroll engine downloaded without scroll | D1 Home fetched another 113,973 source / 45,786 gzip bytes for GSAP + ScrollTrigger while stationary; sampled GSAP execution was small compared with initial layout/Intl work. | `Hero.jsx` retains the same tweens/scrub values but requests modules on scroll/wheel/touch-scroll/scroll-key intent. Dynamic reduced-motion changes cancel/revert installation; navigation cleanup fences late imports. No artwork or image file was changed. A cold first scroll can start the enhancement later; the base hero remains visible and usable. |
| Cold route chunk round trips | Direct Account/Admin routes wait for authorization and lazy code; D1 intentionally isolated them from Home. | Keep guards/splitting. `route-modules.js` and `NavigationIntent.jsx` share code loaders and preload on genuine hover/focus/pointer intent, with Save-Data opt-out and finite module bookkeeping. Authorized admin-tab intent also primes code. No product, account, order or admin data is prefetched. Plain cold direct loads retain their waterfall; do not claim intent removes every cold-load delay. |
| Shop mobile CLS 0.0477 | Layout-shift sources were the footer entering a short loading page and leaving after results, not product-image dimensions. | Reserve the Shop page height in `frontend-reliability.css`; do not fabricate product cards or change filtering/stock behavior. |
| Repeated formatter construction | CPU sampling mapped catalog currency and Overview date work to repeated `Intl` constructors, including the daily table's hidden rows. | Reuse one catalog currency formatter; private Overview keeps only the finite two currency/four date/time variants. Currency strings, integer-piastres values and Cairo date behavior are tested unchanged. No financial result caching. |
| An unused font family was requested | CSS family inventory did not use DM Sans. Actual fonts, loading states, responses and rendered family are recorded in the font runs. | Remove only DM Sans from the Google stylesheet query. Preserve Manrope, Playfair Display, Noto Kufi Arabic, weights, swap behavior and preconnects. Do not claim a binary download saving for an unused family the browser never fetched. No unreviewed self-hosting/subsetting or font substitution. |
| Catch-all rewrite masks generated heads | `_redirects` rewrote every path to root HTML; a filesystem-only HTML audit did not prove those files would be served. Cloudflare documents native SPA fallback and clean `.html` URLs. | Remove the wildcard rewrite, preserve native fallback without top-level `404.html`, generate non-home heads as flat `.html` files to match current canonical URLs. Fourteen heads remain, Arabic home retains `ar/index.html`. Audit all HTML files and reject masking rewrites/private snapshots. Real provider pretty-URL behavior remains an owner-staging check. |
| Robots request lacked a real text file | Missing `robots.txt` could receive SPA HTML. A robots exclusion file is not an indexing/privacy boundary. | Add a real prelaunch crawler policy with empty Disallow, preserving previous default crawl access so bots can read noindex. No sitemap is advertised/published. HTML + Pages noindex/nofollow remain mandatory and are audited. |
| Product SEO needs non-JS architecture | Product names/descriptions/images/canonical/OG are applied by React only after public data arrives. Unknown products currently share SPA HTTP fallback; a generic 200 root head is not product-specific crawlable HTML or true 404 behavior. | Deliver an offline-only product-head preview foundation that requires published product + active matching category + approved HTTPS site/media origins, escapes content and rejects private/signed/noncatalog image URLs. It never runs in build/startup, emits no offers/JSON-LD, writes no sitemap and cannot activate indexing. Future HTML/body delivery is a documented blocker. |
| HTTP caching contradicted frontend freshness | Public products explicitly allowed stale-while-revalidate; public settings include shipping/payment information. Some private admin/media/error paths lacked a default no-store header. | Default all `/api` responses to no-store before parsers/guards; remove product/settings public caching. D1's narrow 30-second contact/policy/category projection remains; no unsafe response cache is added. Successful real local HTTP responses and negative paths are covered. |
| Attached category media counted as orphaned | Real local regression produced two alleged unattached images when only one was unattached: the diagnostic checked product galleries but not category images. | `operations-service.js` checks both collections with bounded existence lookups. The test verifies the count and that all records remain; no object inventory, deletion or retention policy was invented. |
| Forced colors hid branding/control states | Screenshots showed light logos on system-white canvas and unreadable language hover state. | High-contrast-only CSS gives the logo a dark backing and the language control system colors without blur/shadow, including hover/focus. Normal design and the floating control component/flags remain unchanged. |

## Reproducible frontend measurements

D1's report was read, then its committed code was freshly built and preserved in `.playwright/d2-baseline-dist` before functional edits. `frontend-benchmark.mjs` now supports `QC_BENCHMARK_PREFIX=d2`, optional CPU profiling, layout-shift sources, Long Animation Frames, execution metrics, font states and response diagnostics. D1 defaults/artifacts remain available.

| Condition | Desktop | Mobile viewport |
| --- | --- | --- |
| Viewport | 1440 × 900 | 390 × 844 |
| CPU throttle | 1× | 4× |
| Download / latency | 10 Mbps / 20 ms | 1.6 Mbps / 150 ms |
| Cache / response | Cold / gzip | Cold / gzip |
| API | Offline fixtures, synthetic 100 ms delay | Same |
| Main before/after external resources | Blocked | Blocked |
| Extra font experiment | Only Google Fonts hosts permitted | Same |

Primary Home/Shop/Product/Overview cases repeat three times, others once: 38 cases per full run. The lab settles for three seconds, samples trusted language interactions, and makes a Home/Shop journey. Separate adjacent repeated Home/Shop/Overview/Account runs check observed host/timing drift. All raw results and the rejected experiment are retained. No selected favorable run is substituted silently.

These are Windows local Chromium measurements, not Lighthouse scores, field INP, actual Render/Atlas timings, physical-device results or a guaranteed real-user percentile. Gzip/source sizes are response-body/decoded source bytes, not V8 parsed heap. CPU sampling and its overhead are present in both D2 builds; D1 timings without these diagnostics are historical context, not a directly controlled A/B. Google Font latency is uncontrolled external network latency even when CPU/network emulation matches.

<!-- D2_FRONTEND_START -->
Initial stationary Home JavaScript dropped from **429,044 to 317,336 decoded bytes** and **147,224 to 102,222 gzip bytes** (26.0% / 30.6% less). This is deferral, not deletion: after the two scroll-engine chunks load, Home totals become **431,309 decoded / 148,008 gzip bytes**. Shared entry code itself grew by 2,265 decoded / 784 gzip bytes for intent/reduced-motion handling. Admin-only modules remain excluded.

The first full matched run is shown without hiding slower results. LCP is milliseconds; CLS is unitless. Primary route values are three-run medians, remaining routes one diagnostic sample.

| Route | JS gzip before / after | Desktop LCP | Mobile LCP | Mobile CLS |
| --- | ---: | ---: | ---: | ---: |
| Home | 147,224 → 102,222 | 424 → 472 | 1,944 → 2,180 | 0.0000 → 0.0000 |
| Shop | 103,840 → 104,624 | 492 → 568 | 2,080 → 2,404 | 0.0477 → 0.0000 |
| Product | 103,570 → 104,353 | 616 → 668 | 2,268 → 2,648 | 0.0000 → 0.0000 |
| Empty Cart | 107,136 → 107,918 | 480 → 508 | 2,060 → 2,392 | 0.0000 → 0.0000 |
| Login | 103,874 → 104,655 | 480 → 528 | 2,052 → 2,332 | 0.0000 → 0.0000 |
| Account | 103,874 → 104,655 | 780 → 844 | 2,280 → 2,528 | 0.0020 → 0.0020 |
| Overview | 116,117 → 116,982 | 788 → 824 | 2,256 → 2,536 | 0.0000 → 0.0000 |
| Admin Orders | 109,855 → 110,667 | 788 → 860 | 2,320 → 2,512 | 0.0000 → 0.0000 |
| Admin Products | 106,540 → 107,354 | 804 → 852 | 2,492 → 2,560 | 0.0609 → 0.0609 |
| Admin Categories | 106,540 → 107,354 | 784 → 840 | 2,308 → 2,540 | 0.0449 → 0.0449 |
| Admin Settings | 109,346 → 110,159 | 788 → 832 | 2,308 → 2,532 | 0.0000 → 0.0000 |

The adjacent repeat used the same preserved original/candidate builds and settings. The unchanged original baseline also slowed compared with the initial run (for example mobile Shop 2,080 → 2,376 ms), demonstrating session/host drift. This repeat is reported separately, not substituted for the first table.

| Adjacent comparison | Desktop LCP | Mobile LCP | Mobile ScriptDuration (ms) |
| --- | ---: | ---: | ---: |
| home | 488 → 468 | 2,140 → 2,148 | 448 → 367 |
| shop | 536 → 556 | 2,376 → 2,460 | 415 → 453 |
| overview | 840 → 808 | 2,460 → 2,548 | 539 → 521 |
| account | 828 → 864 | 2,468 → 2,528 | 319 → 349 |

In the adjacent run, Home mobile LCP was essentially unchanged (2,140 → 2,148 ms); Home script execution fell 447.8 → 367.1 ms. Shop/Account/Overview mobile cold LCP remained slower by 84/60/88 ms respectively. Overview exceeded the 2,500 ms lab target at 2,548 ms; Account was 2,528 ms. Several first-full-run routes also exceeded the target. **Runtime LCP targets are not universally passed.** These regressions are unresolved rather than attributed entirely to noise.

The first Home-to-Shop heading transition, including mobile drawer interaction, was 173 → 113 ms desktop and 1,109 → 1,001 ms mobile in the adjacent run. Intent starts code loading without fetching protected data; a cold direct URL still incurs its guarded module load. Both builds made 7 API calls in the Home/Shop journey. No stale price cache or private-data prefetch was used.

The largest Home mobile task in the adjacent comparison was 534 → 568 ms. Long tasks remain above 200 ms; no field INP improvement or elimination of startup blocking is claimed. The largest trusted language EventTiming sample in the full candidate run was 72 ms. Font/script/layout work and machine variability need real-device/field follow-up.

Extra Google Fonts runs (same throttles/cache settings, external latency uncontrolled):

| Home with real font hosts | Desktop LCP | Mobile LCP | Mobile CLS |
| --- | ---: | ---: | ---: |
| Before / after | 984 → 852 | 2,260 → 2,244 | 0.0025 → 0.0025 |

Successful HTTP font responses and loaded FontFace entries were observed for Manrope, Playfair Display. Arabic font responses were also observed during locale interaction. The unused DM Sans family had no observed binary download: removal reduces stylesheet declarations, not claimed WOFF savings. Cross-origin ResourceTiming restrictions/late loads mean these records are not a complete font wire-byte accounting. The `swap` font strategy still produces small layout shifts in real-font runs; no typography replacement was attempted.

All 38 candidate main-run cases had 0 page errors and 0 viewport overflows. Shop mobile CLS changed 0.0477 → 0.0000. The byte budgets passed: entry 317,336 source / 102,222 gzip, first-party CSS 40,468 source / 10,570 gzip. Final rebuilt JS/CSS hashes were verified identical to the measured assets; adding robots.txt did not change the measured code. The rejected observer experiment is retained as `d2-observer-experiment.json` and is not the shipped sizing strategy.
<!-- D2_FRONTEND_END -->

## Backend/database efficiency

`scripts/database-benchmark.mjs` uses the C1 isolated-replica helper. It never loads dotenv, accepts only `mongodb://127.0.0.1:<port>/?replicaSet=qc-c1-rs`, chooses a unique disposable database, creates fixtures/indexes **there only**, and drops only that owned DB. There are 1,500 products, 12 categories, 3,000 orders, 2,000 ledger events, 300 proof intents, 100 media records and 100 pending outbox records. No worker is activated. The fixture helper permits eight connections while the application pool is five. Data distributions and local hardware differ from Atlas; document/key counts are more portable evidence than millisecond timings. Explain ignores the plan cache; three-run service medians are warm local diagnostics, not a production SLA.

<!-- D2_DATABASE_START -->
| Query | Documents examined with existing indexes | With local candidate | Candidate key |
| --- | ---: | ---: | --- |
| admin all products | 1500 | 20 | products `{createdAt:-1,_id:-1}` |
| admin products | 1125 | 20 | products `{status:1,createdAt:-1,_id:-1}` |
| public newest | 875 | 24 | same status/recent key |
| public price | 875 | 22 | products `{status:1,pricePiastres:1,_id:1}` |
| order variant history | 3000 | 2 | orders `{lines.productId:1}` |
| public image lookup | 1500 | 1 | products `{imageKeys:1}` |

Default/filtered product candidates eliminated their blocking sorts. Recent Orders already examined just 20 documents for 20 results using its existing index. Unanchored name search examined 1,125 documents and still sorted; an unrelated index is not presented as a search solution.

Local service medians in the candidate-index experiment:

| Service | Median ms | Reply bytes |
| --- | ---: | ---: |
| notification/storage health before media index | 89.6 | 489 |
| ledger overview incl reconciliation | 1344.38 | 5516 |
| read-only reconciliation | 1407.48 | 137 |
| notification/storage health with media index | 30.31 | 489 |

These are small local synthetic fixtures. Financial/reconciliation commands still inspect history; indexes were additive local candidates, not an applied Atlas migration. Service timing, including the media-index before/after comparison, is not a Render/Atlas capacity promise.
<!-- D2_DATABASE_END -->

Candidate indexes are recommendations, not migrations or model changes. The owner has only a tiny pending catalog; do not pay write/storage cost for every candidate by default. Before any approved Atlas change: inventory indexes and volume, export/backup, preserve unique correctness indexes, confirm query shape and collation, measure unhinted plans with realistic data, create reviewed additive indexes during a controlled window, observe write/space costs, record rollback/drop names, then decide whether an older redundant nonunique index can be removed. Do not run `syncIndexes`, delete data or implicitly migrate through an unreviewed model edit.

Other inspected behavior:

- Public lists/admin/customer Orders paginate 20 records and reject pages outside 1–1000. Deep skip still costs work. Categories are not paginated; current tiny category count makes that acceptable, but no infinite-scale claim is made.
- Product search escapes input and bounds length, but case-insensitive unanchored bilingual substring regex cannot use an ordinary name index efficiently. Do not add a speculative text index that changes Arabic/search semantics. Consider a separately approved search design only when actual catalog size and timings justify it.
- Public Product detail uses the slug index plus an active-category existence check. Cart/quote bulk-load product IDs and allowed category IDs, avoiding one read per cart line. Transactional stock reads/writes are deliberately ordered, bounded and revision checked; no attempt was made to parallelize them or weaken C1 retries.
- Recent Orders uses the existing `{createdAt:-1,_id:-1}` index. Session lookup uses a token hash index and expiry check, then one user lookup to revalidate role; caching privileges was deliberately avoided.
- Overview runs six top-level reads plus a five-pipeline reconciliation group (eleven DB commands); operational health is a separate three-pipeline request. The five-connection process pool queues some parallel work. There is no automatic report polling in the UI; reconciliation detail remains on demand, and financial completeness is checked by the main report.
- Whole-history Operations counters, inventory facets, reconciliation and notification/storage health include scans/joins by design. Small bounded response size does **not** bound examined documents. Existing aggregate maxTimeMS is 5 seconds. Reconciliation must not be narrowed to “paid only,” silently cached as complete or replaced by approximate figures; that would hide corruption/legacy gaps and change C2 definitions.
- Proof lookups and monetary joins use existing identity/order references. Storage diagnostics are metadata-based, not R2 object listing. Category attachment correctness was repaired, but no automatic cleanup/retry is enabled.

## Node / Render readiness assessment

Inspected `index.js`, `db/connect.js`, shutdown, production config, limiter, transactions, worker and `render.yaml`. The blueprint still proposes one Starter web instance in Frankfurt, server root, `npm ci`/`npm start`, `/api/ready`, manual deploys, and closed flags. It was not submitted to a provider or used to create/change resources.

One process owns one Mongoose connection pool (`maxPoolSize:5`, selection timeout 10 seconds). Transactions keep three bounded body attempts, a 15-second overall deadline and 5-second commit cap. Worker defaults remain batch 5, poll 120 seconds, lease 60 seconds, SMTP attempt 20 seconds, bounded DB operations; disabled email creates no polling timer. Shutdown drains the server/worker with a 25-second deadline. `/api/ready` rejects disconnected DB state. Logs use sanitized codes rather than provider text/secrets.

An isolated process import/listen check without a DB or worker recorded Node v22.23.2, about 741 ms module import + 38 ms listen/probe, RSS 94,953,472 bytes and ready status 503. This is a local development-machine observation, not Render live RAM/CPU/bandwidth or a load test. Actual TLS sockets, DB traffic, mail/media bursts and provider limits remain integration checks. No global HTTP timeout or pool change was invented without a workload budget.

The limiter remains a bounded shared 5,000-entry process store with hashed identities, expiry heap, fail-closed capacity, 429/Retry-After and no periodic timer. It is not a distributed limit: restarts/deploy overlap/horizontal replicas change effective allowances. Queue fencing remains safe across worker instances, but that does not solve distributed HTTP limiting. Starter suitability is conditional on real resource/latency/queue measurements; no tier or billing change was made.

## SEO, infrastructure and security readiness

The fourteen fixed EN/AR heads retain title/description, lang/RTL and OG/Twitter tags. Canonical and reciprocal en/ar/x-default links are emitted only with a validated approved HTTPS origin. The postbuild generator reads the process environment: supply the same VITE_PUBLIC_SITE_ORIGIN to Vite and the Node postbuild step in provider settings; a client-only dotenv value is not proof that static heads received it. Product metadata remains CSR in the live application. The prepared `productHeadPreview` accepts only approved public catalog-origin images and contains no financial offers, review claims, stock guesses or private information.

Future product delivery should use either a reviewed offline published-catalog export at build time or a reviewed Pages HTML-at-request adapter fetching only the public catalog with bounded timeouts. Return the same truthful head/body to people and bots, not user-agent cloaking. Include visible product content, correct not-found status/404 architecture, matching canonical/hreflang, approved public sharing images and cache invalidation. Head-only preview output is not full prerendering. None of this is wired to deployment until the owner provides catalog/domain approvals. Sitemap generation remains guarded; no sitemap or Product/Offer JSON-LD is published.

Pages' native asset-first SPA behavior and flat head filenames are preparation based on current official documentation. Vite preview's SPA middleware is not a substitute for the Cloudflare resolver: no-JS browser tests verify actual generated `.html` artifacts directly. Unknown product routes still return the generic SPA fallback locally; production crawlable product pages/real 404s remain a stated blocker.

All APIs now default no-store, including unavailable/private/error responses. The public product/settings endpoints no longer authorize stale shared responses. Static hashed assets retain their existing immutable caching; no caching rule is added for private proofs or financial responses. Cookie auth is host-only, HttpOnly/Secure in production, SameSite=Lax; writes require an exact approved Origin, and credentialed CORS is exact rather than wildcard. One-hop proxy trust was tested locally, not verified on a real Render/Cloudflare path.

The CSP builder in `scripts/security/csp-values.mjs` is **candidate-only**, not emitted in `_headers` or server startup. Local browser tests enforced it for public dynamic chunks and Arabic admin/chart flows. It allows exact configured API/media/R2 origins, Google font hosts and inline **styles** needed by React/GSAP; it permits neither inline scripts nor unsafe-eval and restricts objects, base URLs, forms and framing. Final real uploads, signed proof media, fonts, domains and headers still require Report-Only observation before enforcement. No violation-report collector or sensitive replay action was added.

R2 remains unconfigured/uncontacted. Public/private buckets must be separate, signed upload URLs last 90 seconds, private view URLs 60 seconds with no-store, and image/proof confirmation validates declared size/type/signature. Catalog media is delivered directly; HEAD/range checks and proof freezing are integrity work, not redundant requests to delete for speed. Signature checking is not full image decoding/pixel validation. DB diagnostics cannot prove every orphaned object exists or is safe to delete; retention/cleanup needs owner policy and a separate audited plan.

Current official sources consulted: [Pages native routing](https://developers.cloudflare.com/pages/configuration/serving-pages/), [Pages redirects](https://developers.cloudflare.com/pages/configuration/redirects/), [Pages headers](https://developers.cloudflare.com/pages/configuration/headers/), [Google JavaScript SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics), [R2 presigning](https://developers.cloudflare.com/r2/api/s3/presigned-urls/), [R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/), [Render Blueprints](https://render.com/docs/blueprint-spec), [Render readiness checks](https://render.com/docs/health-checks), [Render shutdown](https://render.com/docs/deploys#graceful-shutdown), [Express proxies](https://expressjs.com/en/guide/behind-proxies/), [MongoDB explain](https://www.mongodb.com/docs/manual/reference/explain-results/). No account connection/deployment tool was used.

## Accessibility and browser verification

The 28 content-ready route/viewport checks cover 320/390/768/1440 px. New checks exercise forced colors, actual emulated touch input, keyboard-only navigation/focus, EN/AR transitions, dynamic reduced motion, chunk/data separation, candidate CSP, generated non-JS HTML and real browser zoom. A disposable extension used Chromium's tabs zoom API; zoom 2 changed the CSS viewport from 1,408 to 704 pixels and DPR from 1 to 2. Public EN/AR and admin/settings reflow were checked at that zoom. Installed Edge separately exercised public and Arabic admin navigation.

Chromium and Edge share an engine; this is not Gecko/WebKit coverage. Firefox/WebKit binaries were not available in the local Playwright cache. No physical device, VoiceOver/NVDA audition or WCAG certification is claimed. Forced-color screenshots were inspected and the logo/language hover failure repaired. True device touch ergonomics, 200% zoom with real fonts/media, forced-color variants and assistive technology remain manual acceptance work.

## Validation results

<!-- D2_TESTS_START -->
| Final validation | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Entire backend, all local MongoDB integration groups enabled | 162 | 0 | 0 |
| Entire existing + D2 browser suite (including installed Edge and actual zoom) | 91 | 0 | 0 |
| Source/SEO/cache/readiness unit tests | 34 | 0 | 0 |
| Targeted content-ready accessibility route/viewport cases | 28 | 0 | 0 |
| Deterministic initial JS/CSS budgets | 4 | 0 | 0 |
| Prelaunch source checks | 19 | 0 | 0 |
| Generated public HTML audit | 14 | 0 | 0 |

ESLint and the production build passed. Both dependency audits reported **0 vulnerabilities** (client including development dependencies). Git whitespace checks include tracked and all new D2 files. Runtime LCP/long-task targets are **not all met**, as disclosed above; those diagnostic measurements are not counted as passing Core Web Vitals tests. No screen-reader or physical-device test is claimed.
<!-- D2_TESTS_END -->

Backend suites used only the dedicated MongoDB 8.0.16 loopback replica set, unique owned test DBs and injected mock SMTP. They include C1 stock/concurrency, C2 ledger/refund foundation, C3 lease/failure recovery, Overview aggregation, real local HTTP cache behavior and category/product media diagnostics. Actual SMTP delivery and cloud database/storage behavior remain untested. An intermediate HTTP test cleanup incorrectly closed all Mongoose connections; it was corrected to close only its default connection, and its single identified disposable DB was explicitly checked and removed. Final cleanup must leave only admin/config/local on the dedicated test node.

## Exact source changes and reproduction

<!-- D2_FILES_START -->
| Status | File | Purpose |
| --- | --- | --- |
| Modified | `client/index.html` | Remove unused font family; retain approved typography/prelaunch tags. |
| Modified | `client/public/_redirects` | Use Pages native fallback without masking static heads. |
| Modified | `client/src/App.jsx` | Share lazy route loaders and mount intent-only code preloading. |
| Modified | `client/src/admin/CatalogAdmin.jsx` | Prime authorized tab code on hover/focus; never preload records. |
| Modified | `client/src/admin/overview-copy.js` | Reuse finite locale currency/date formatters. |
| Modified | `client/src/components/CatalogCards.jsx` | Reuse the catalog currency formatter. |
| Modified | `client/src/components/Hero.jsx` | Defer unchanged scroll engine until intent; react to reduced-motion changes. |
| Modified | `client/src/frontend-reliability.css` | Shop height stability, marquee containment and forced-color visibility. |
| Modified | `scripts/frontend-accessibility.mjs` | Separate D1/D2 artifacts and baseline selection. |
| Modified | `scripts/frontend-benchmark.mjs` | CPU/LoAF/layout/font diagnostics, matched D2 and optional real-font runs. |
| Modified | `scripts/prelaunch-check.mjs` | Verify native fallback and real prelaunch robots policy. |
| Modified | `scripts/seo/audit-built-values.mjs` | Audit every HTML file, no masking rewrite/404, robots/noindex protection. |
| Modified | `scripts/seo/static-head-values.mjs` | Map 14 heads to canonical-compatible clean HTML paths. |
| Modified | `server/src/admin/operations-service.js` | Do not classify category-attached media as orphaned. |
| Modified | `server/src/app.js` | Default API responses/errors to no-store before parsing/guards. |
| Modified | `server/src/routes/catalog.routes.js` | Remove stale shared caching of product prices/stock. |
| Modified | `server/src/routes/store.routes.js` | Do not cache combined payment/shipping settings responses. |
| Modified | `tests/built-html-audit.test.mjs` | Exercise native routing, robots and updated output paths. |
| Modified | `tests/static-heads.test.mjs` | Verify clean Arabic head path while preserving Arabic home. |
| New | `PHASE_D2_OWNER_HANDOFF.md` | Owner/developer readiness matrix, costs and controlled launch gates. |
| New | `READ_ME_PHASE_D2_READINESS.md` | Measured findings, limits, tests and review instructions. |
| New | `client/public/robots.txt` | Actual text crawler policy; no sitemap or indexing activation. |
| New | `client/src/components/NavigationIntent.jsx` | Cleaned-up finite passive intent listeners. |
| New | `client/src/lib/route-modules.js` | Shared guarded code loaders and bounded preload bookkeeping. |
| New | `scripts/database-benchmark.mjs` | Isolated fixtures, exact query explains and local-only candidate indexes. |
| New | `scripts/security/csp-values.mjs` | Validated exact-origin candidate policy, not enforced in production. |
| New | `scripts/seo/product-head-preview.mjs` | Offline, escaped, noindex-only product metadata foundation. |
| New | `server/test/deployment-security.test.js` | Four HTTP/cache/CORS/proxy tests, including actual local DB success. |
| New | `server/test/storage-readiness.test.js` | Real DB category/product/orphan classification and no-deletion test. |
| New | `tests/browser/readiness.browser.mjs` | Ten CSP/intent/touch/zoom/Edge/forced-color/non-JS/hero checks. |
| New | `tests/readiness.test.mjs` | Five offline metadata, routing, CSP and formatter regressions. |
<!-- D2_FILES_END -->

After `npm.cmd --prefix client run build`, run `node scripts/check-frontend-budgets.mjs`, `node --test tests/*.test.mjs`, `npm.cmd --prefix client run lint`, `node scripts/prelaunch-check.mjs`, `node scripts/audit-built-html.mjs`, both read-only npm audits and `git diff --check`.

Use the existing C1 isolated replica setup on `127.0.0.1:27029` with `qc-c1-rs`, then set `QC_COMMERCE_TEST_MONGO_URI=mongodb://127.0.0.1:27029/?replicaSet=qc-c1-rs` and `QC_OVERVIEW_TEST_MONGO_URI=mongodb://127.0.0.1:27029` before `npm.cmd --prefix server test`. Never substitute Atlas. The database benchmark uses the former variable and creates/deletes only its own disposable DB. Do not overlap it with C1 failpoint tests.

Browser commands use the existing Playwright module/browser paths documented in the D1 report; set `QC_BROWSER_URL=http://127.0.0.1:5175` against local `npm.cmd --prefix client run preview -- --host 127.0.0.1 --port 5175 --strictPort`, then run `node --test --test-concurrency=1 tests/browser/*.browser.mjs`. All API data is intercepted. The local zoom extension is disposable and does not touch an existing browser profile.

For measurements, set `QC_BENCHMARK_PREFIX=d2` and `QC_PROFILE=true`; run `node scripts/frontend-benchmark.mjs before` / `after`. The before mode requires the preserved `.playwright/d2-baseline-dist`; do not overwrite it with the new build. Optional `QC_FONTS=live` permits only Google font hosts; leave it unset for the controlled offline comparison. The adjacent repeat uses the case filter `home,shop,overview,account`. Run `node scripts/frontend-accessibility.mjs after` with the same prefix to preserve D1 artifacts.

Manual review: verify the D1 logo/nav/drawer/locale/cart flows; hover/focus a public link and confirm only code preloads; hover an authorized admin tab and confirm no records load yet; test Save-Data/slow-chunk/offline recovery; scroll the hero then toggle reduced motion; inspect Shop while its API is delayed and images fail; use keyboard, forced colors, real 200% browser zoom and mobile/tablet sizes; inspect generated HTML source and actual provider pretty URLs once authorized; check noindex/headers/robots and no sitemap/commerce JSON-LD. Do not place live orders, send mail or test real refunds during this review.

Review artifacts are ignored local files: `.playwright/d2-before.json`, `d2-after.json`, adjacent/Google Fonts variants, `d2-observer-experiment.json`, `d2-database.json`, `d2-node-process.json`, `d2-zoom.json`, source/backend/browser/a11y/build/audit logs, `d2-review.diff`, `d2-diff-summary.txt`, and `d2-git-status.txt`.

<!-- D2_GIT_START -->
Final branch `main`, HEAD `e4e77fd`: **19 D2 tracked files modified + 12 D2 files created = 31 files**. The pre-existing owner `client/.env.example` edit is additional, byte-identical and excluded from the review patch. No change is staged. No commit, push or deployment was performed.

The dedicated test database server contained only `admin`, `config`, `local` before shutdown; all owned fixture DBs/candidate indexes were removed. The local production preview and test replica set started for D2 were stopped. Full status and aggregate patch statistics are saved in `.playwright/d2-git-status.txt` / `d2-diff-summary.txt`; `.playwright/d2-review.diff` includes all 31 modified/new D2 files.
<!-- D2_GIT_END -->
