# Phase D1 — frontend performance, accessibility and reliability

Reviewed locally on 27 October 2026 against `main` at `8a6e2e1`.

## Scope and safeguards

This phase changes frontend loading, read requests, feedback, keyboard access and media fallbacks. No backend, ledger, payment, stock or notification service was changed. No dependencies were added or updated. No production Atlas, R2, Render or Cloudflare resource was contacted. No real email was sent. No checkout, registration, expiration, SMTP, refund or correction flag was enabled. Noindex protections remain in source and all 14 generated public HTML heads. Nothing was staged, committed, pushed or deployed.

The pre-existing `client/.env.example` modification belongs to the owner and is excluded from the D1 review patch. Its SHA-256 before and after is `4D948F3FBE78254434D7EC3D621A0E6DC6C9BC568299941FF2D86766FA605B92`. No environment file was edited.

## Baseline and confirmed causes

Inspection and production measurements preceded functional edits. The original production output was preserved in `.playwright/d1-baseline-dist` before changing imports.

| Finding | Confirmed cause and repair |
| --- | --- |
| Home downloaded private admin code | `App.jsx` statically imported `OtherPages.jsx`, which imported `CatalogAdmin.jsx`; that imported Overview, Orders, Settings and MediaEditor. Split route groups and admin panels with React `lazy`/Suspense. The guarded admin loader starts only after authorization and loads its shell/requested initial panel concurrently. Home remains eager to avoid another critical-path waterfall. |
| Repeated public requests | Footer/Legal independently requested settings and Home/Shop repeatedly requested categories. `public-read.js` shares in-flight work and has a two-key, 30-second memory cache. It projects only category metadata, business contact fields and bilingual policy text. Payment/shipping configuration, products, prices, stock, sessions, cart and admin responses are excluded. Public metadata requests omit credentials; other requests retain credentials and `no-store`. No persistence, background polling, eviction timer or automatic mutation retries. |
| Unnecessary private/commerce reads | Categories fetched Products too; an empty Cart posted a validation request. Fetch Products only on its tab and skip validation for an empty cart. Nonempty cart prices/stock remain server-validated. Overview, operational health and reconciliation retain independent read/retry behavior; reconciliation remains on demand. |
| Stale read responses | Add/sustain AbortController ownership on public pages, private catalog/settings reads and checkout configuration. Superseded/abandoned reads cannot update current state. No financial or commerce write is cached, cancelled or automatically retried by this change. |
| Session race after login | A delayed initial `/auth/me` guest response could replace the completed login and redirect the user back to Login. Reproduced with a delayed browser fixture before fixing it. Session read revisions plus cancellation fence stale results; successful login/logout invalidates pending reads. Server authorization remains authoritative. |
| Misleading failures | The API helper converted unreadable successful JSON into `{}`; Home swallowed collection errors into empty/coming-soon UI. Reject invalid success payloads, distinguish loading/error/empty states, and offer explicit read retry. Shop shows an unavailable count rather than a fabricated zero on error. |
| Wrong-period data flash | Overview briefly rendered the previous series after changing its range query. Require the returned period to match the request and suppress stale-period metrics until the requested response arrives. No accounting calculation changed. |
| Layout movement during loading | Product data, Overview metrics and Settings forms displaced the visible footer/secondary panels. Reserve loading space; keep short commerce/admin pages at an appropriate minimum height. Set the admin height in its own lazy stylesheet so later CSS cannot override it. Settings exposes `aria-busy` and reserves space while reading. |
| Missing keyboard affordances | Shop's `outline:none` hid its input focus. Add a visible focus-within outline, a bilingual skip-to-main link and main focus target. Preserve and test the existing drawer trap/Escape/focus return. Localize header trigger labels. |
| Moving content had no pause control | Reduced motion was already supported, but normal-motion users could not stop the marquee. Add a small keyboard-accessible pause/resume button with localized name and pressed state. Copy, alternating icons, two-group geometry and seamless loop remain unchanged. The button is hidden when reduced motion already makes the bar static. |
| Missing/unavailable images | Add an honest coffee-icon fallback with an accessible name when appropriate, without fake photos or repeated URL retries. Set dimensions and async decoding on catalog/product/cart images; lazy-load below-fold media and footer logo; prioritize the product's visible image. |

The approved responsive hero already used high-priority desktop/mobile WebP sources, dimensions and media-specific preloads. Its compressed files were already small enough that changing artwork/quality was not justified. Both hero files and both logos were compared byte-for-byte with the baseline build and are unchanged.

## Measurement method and limits

`scripts/frontend-benchmark.mjs` serves gzip-compressed production files on loopback with browser cache disabled. It blocks external resources and fulfills every API call with existing offline fixtures after a synthetic 100 ms delay. There is no backend connection. Both builds used the same instrumentation and fixture shapes.

| Condition | Desktop | Mobile viewport |
| --- | --- | --- |
| Chromium viewport | 1440 × 900 | 390 × 844 |
| CPU throttle | 1× | 4× |
| Download / latency | 10 Mbps / 20 ms | 1.6 Mbps / 150 ms |
| Cache / compression | Cold / gzip | Cold / gzip |
| Motion | Normal | Normal |

Home, Shop, Product and Overview each have three cold runs per device; the table uses their medians. Other routes have one diagnostic run each. There are 38 runs per full before/after measurement. The page settles for three seconds before capturing initial metrics. The lab also performs a trusted language-toggle click and a Home → Shop → Home → Shop journey.

**These are local lab measurements, not Lighthouse scores or production Core Web Vitals.** Google Fonts and all external images/services are blocked, so the test uses fallback fonts and fixture media. Real font downloads, owner product imagery, Cloudflare caching, Render cold starts, Mongo latency and physical devices are outside this measurement. The mobile case is a throttled viewport on this Windows machine, not a physical-phone, DPR or touch-device simulation.

JavaScript gzip bytes are ResourceTiming response-body bytes, excluding HTTP headers; decoded bytes are uncompressed source supplied to the parser, not measured V8 heap/compiled-code size. EventTiming samples and long tasks are diagnostics, not field INP. No React Profiler render-count reduction is claimed.

<!-- D1_METRICS_START -->
The final full run contained **38 cases**, with **0 browser page errors** and **0 viewport overflows**.

| Initial asset | Before source / gzip bytes | After source / gzip bytes | Reduction |
| --- | ---: | ---: | --- |
| Entry JavaScript | 404,519 / 126,137 | 315,071 / 101,438 | 22.1% source; 19.6% gzip |
| Home total JavaScript, including GSAP | 518,492 / 171,923 | 429,044 / 147,224 | 17.3% source; 14.4% gzip |
| First-party initial CSS | 55,493 / 13,411 | 40,045 / 10,474 | 27.8% source; 21.9% gzip |

All routes below are direct cold loads. LCP is in milliseconds; CLS is unitless. Arrows mean before → after. Primary-route LCP/CLS use three-run medians; other rows are one sample.

| Route | JS gzip bytes | Desktop LCP | Mobile LCP | Desktop CLS | Mobile CLS |
| --- | ---: | ---: | ---: | ---: | ---: |
| Home | 171,923 → 147,224 | 464 → 452 | 2,228 → 1,968 | 0.0000 → 0.0000 | 0.0000 → 0.0000 |
| Shop | 126,137 → 103,840 | 432 → 480 | 2,144 → 2,096 | 0.0000 → 0.0000 | 0.0213 → 0.0477 |
| Product | 126,137 → 103,570 | 548 → 608 | 2,324 → 2,272 | 0.0385 → 0.0000 | 0.1422 → 0.0000 |
| Empty Cart | 126,137 → 107,136 | 420 → 488 | 2,368 → 2,476 | 0.0000 → 0.0000 | 0.0000 → 0.0000 |
| Login | 126,137 → 103,874 | 400 → 496 | 2,144 → 2,156 | 0.0000 → 0.0000 | 0.0000 → 0.0000 |
| Customer Account | 126,137 → 103,874 | 540 → 792 | 2,240 → 2,320 | 0.0522 → 0.0000 | 0.0470 → 0.0020 |
| Admin Overview | 126,137 → 116,117 | 532 → 784 | 2,272 → 2,292 | 0.1403 → 0.0000 | 0.1757 → 0.0000 |
| Admin Orders | 126,137 → 109,855 | 536 → 784 | 2,276 → 2,288 | 0.0390 → 0.0016 | 0.0685 → 0.0000 |
| Admin Products | 126,137 → 106,540 | 512 → 812 | 2,272 → 2,320 | 0.0449 → 0.0128 | 0.1228 → 0.0609 |
| Admin Categories | 126,137 → 106,540 | 540 → 792 | 2,256 → 2,268 | 0.0237 → 0.0086 | 0.0745 → 0.0449 |
| Admin Settings | 126,137 → 109,346 | 524 → 792 | 2,280 → 2,336 | 0.1137 → 0.0000 | 0.1011 → 0.0000 |

Initial API request counts (desktop and mobile agree):

| Route | Before → after |
| --- | ---: |
| home | 4 → 4 |
| shop | 4 → 4 |
| product | 3 → 3 |
| cart | 3 → 2 |
| login | 2 → 2 |
| account | 2 → 2 |
| overview | 4 → 4 |
| orders | 3 → 3 |
| products | 4 → 4 |
| categories | 4 → 3 |
| settings | 3 → 3 |

The Home → Shop → Home → Shop journey dropped from **10 to 7 API calls** (30%). Category reads dropped from four to one; product/stock-related reads were deliberately not cached. The first Shop-heading transition was **80 → 139 ms desktop** and **640 → 873 ms mobile**, including opening the mobile drawer. These are single journey samples, not distributions.

The maximum observed trusted language-toggle EventTiming sample was **48 ms** after the change. The largest mobile long task was **360 ms** (baseline 349 ms): main-thread startup/animation work remains a D2 concern despite the smaller transfer. No field INP improvement is claimed.

All four deterministic byte budgets passed. The measured Home-total, primary mobile LCP, route CLS, interaction-sample, first Shop-transition and warm-journey request targets were met in this run. Shop mobile CLS increased within budget (0.0213 → 0.0477); several cold desktop routes and the single Cart mobile sample became slower. These are disclosed tradeoffs/remaining optimization opportunities, not hidden regressions. Home mobile LCP changed from 2,228 to 1,968 ms (11.7% lower).
<!-- D1_METRICS_END -->

The extra cold-route round trip is an explicit cost of isolating route code. The report records it; it does not claim every route becomes faster. No speculative prefetching of admin data or a second cache of financial responses was introduced to conceal that cost.

## Practical budgets

Use decimal bytes/kB. `node scripts/check-frontend-budgets.mjs` enforces the deterministic, first-party initial asset limits after a production build:

| Budget | Limit |
| --- | ---: |
| Entry JavaScript source / gzip | 320,000 / 105,000 bytes |
| First-party initial CSS source / gzip | 45,000 / 12,000 bytes |
| Home JavaScript including normal-motion animation chunks | 440,000 source / 150,000 gzip bytes |
| Mobile primary-route lab LCP | ≤ 2,500 ms target |
| Initial route CLS | ≤ 0.10 target |
| Trusted interaction EventTiming sample | ≤ 200 ms target; not an INP claim |
| Cold first Home → Shop heading | ≤ 1,500 ms target, including mobile menu interaction |
| Home → Shop → Home → Shop API requests within public TTL | ≤ 7, including initial reads; stock/product reads stay fresh |

Only the four entry JS/CSS byte limits are deterministic automated build gates. Timing, Home-total and request budgets are checked against the recorded browser lab; do not use host-sensitive LCP numbers as CI guarantees. These targets follow the intent of [Core Web Vitals thresholds](https://web.dev/articles/vitals); field verification is still required. Lazy routes use [React's supported lazy-loading mechanism](https://react.dev/reference/react/lazy).

## Accessibility and responsive verification

The final content-ready audit covered Home, Shop, Product, Login, Overview, Products and Arabic Settings at 320, 390, 768 and 1440 pixels: **28/28 cases passed** the targeted checks. There were no viewport overflows, unnamed exposed controls, missing dimensions on visible images, or contrast failures in sampled opaque text. All cases have a skip link; Shop's form has a visible focus-within outline. Small native checkboxes were observed inside larger labeled controls; their raw 16 px boxes alone are not treated as a proven target-spacing failure.

The contrast heuristic skips gradients, translucent layers and image backgrounds. This is not an axe scan, a complete WCAG audit or screen-reader certification. Manual NVDA/VoiceOver, zoom, forced-colors, real fonts and physical touch-device testing remain D2 work. Keyboard browser tests cover skip activation, focus visibility, drawer wrapping/Escape/focus return, pause/resume, EN/AR switching, route errors and explicit recovery.

Screenshots were visually reviewed: `.playwright/d1-390-home.png`, `.playwright/d1-1440-overview.png`, `.playwright/d1-390-arabic-settings.png`. They use fixture data/fallback fonts and reduced motion; they do not represent production database contents.

## Exact changed and created files

| File | Change |
| --- | --- |
| `client/src/App.jsx` | Lazy route groups, authorized parallel admin loading, shared boundaries, skip link, stable scroll-restoration ownership. |
| `client/src/pages/OtherPages.jsx` | Remove eager admin import; share the narrow public legal-policy read. |
| `client/src/components/RouteBoundary.jsx` **new** | Localized accessible loading/error states; explicit reload/home recovery for failed chunks; reset errors on navigation without remounting healthy children. |
| `client/src/components/NavigationEffects.jsx` | Assign main focus target and apply route scroll/hash restoration after lazy content commits. Bounded history-position map remains. |
| `client/src/admin/CatalogAdmin.jsx` | Lazy private panels/media; tab-scoped, cancellable catalog reads; preserve product editor and deep links. |
| `client/src/admin/StoreSettingsAdmin.jsx` | Superseded read cancellation and accessible reserved loading state. |
| `client/src/admin/AdminOverview.jsx` | Fence wrong-period results and loading feedback; financial definitions untouched. |
| `client/src/admin/catalog-admin.css` | Keep short admin content from exposing a footer that jumps during loading. |
| `client/src/lib/api.js` | Reject unreadable success responses; explicit no-store and tightly restricted credential-free public metadata reads. |
| `client/src/lib/public-read.js` **new** | Two-key public projection/cache/deduplication, clone isolation, 30-second TTL and subscriber-safe cancellation. |
| `client/src/lib/session.jsx` | Fence superseded reads and login/logout races; preserve fail-closed session errors. |
| `client/src/pages/HomePage.jsx` | Independent collection loading/error/empty/retry states; public category sharing. |
| `client/src/pages/ShopPage.jsx` | Public category sharing, cancellation guards, response validation, explicit retry/unavailable count and named pagination controls. |
| `client/src/pages/ProductPage.jsx` | Product response/cancellation guards, retry, accurate loading announcement and stable image fallbacks. |
| `client/src/commerce/CartPages.jsx` | Skip empty validation, ignore abandoned responses, cancel config read, stable thumbnail fallbacks. Commerce writes unchanged. |
| `client/src/commerce/commerce.css` | Stable minimum page height across a cold commerce-route fallback and its short content. |
| `client/src/components/SafeImage.jsx` **new** | Accessible, non-photographic missing-media fallback without retry loops. |
| `client/src/components/CatalogCards.jsx` | Image dimensions, async decoding and fallbacks within existing media ratios. |
| `client/src/components/Footer.jsx` | Share narrow public settings read, cancel abandoned work, lazy/decode the existing logo. |
| `client/src/components/Header.jsx` | Localized menu trigger/nav names; decorative menu icons hidden from assistive technology. Navigation design/logic preserved. |
| `client/src/components/AnnouncementBar.jsx` | Bilingual user-controlled pause/resume; preserve continuous animation/copy/icons. |
| `client/src/lib/ui-copy.js` **new** | Focused EN/AR loading, retry, skip and pause text. |
| `client/src/frontend-reliability.css` **new** | Loading stability, focus/skip/pause affordances and media fallback layout. |
| `client/src/main.jsx` | Import the focused reliability stylesheet. |
| `tests/browser/navigation.browser.mjs` | Wait for Shop readiness before scroll assertions; use the visible main during Suspense retention while verifying logos also work during loading. |
| `tests/browser/frontend.browser.mjs` **new** | 19 real-click production regressions with offline fixtures, including session races, cancelled reads and failed chunks. |
| `tests/public-read.test.mjs` **new** | Six meaningful cache/privacy/TTL/cancellation/error/API tests. |
| `scripts/frontend-benchmark.mjs` **new** | Matched offline production performance measurements and request journeys. |
| `scripts/frontend-accessibility.mjs` **new** | Content-ready DOM/AX/contrast/layout checks and local review screenshots. |
| `scripts/check-frontend-budgets.mjs` **new** | Four deterministic first-party production asset budgets. |
| `READ_ME_PHASE_D1_FRONTEND.md` **new** | Findings, measurements, results, limitations and verification instructions. |

The floating language component, flag SVGs, locale/navigation utilities, hero assets, logos, backend source, lockfiles and all environment files are unchanged by D1.

## Final validation results

| Validation actually run | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Complete backend `npm.cmd --prefix server test` | 157 | 0 | 0 |
| Production browser regressions, existing 62 + new 19 | 81 | 0 | 0 |
| Root source/SEO + new public-read tests | 29 | 0 | 0 |
| Targeted content-ready accessibility route/viewport cases | 28 | 0 | 0 |
| Deterministic initial JS/CSS budgets | 4 | 0 | 0 |
| Prelaunch source checks | 18 | 0 | 0 |
| Built public HTML audit | 14 | 0 | 0 |

Frontend ESLint and the production build passed. Both npm dependency audits reported **0 vulnerabilities**, including dev dependencies on the client. Git whitespace validation passed. The final performance-run result and any budget exceptions are in the measurement table above.

Backend integration tests used the existing portable MongoDB 8.0.16 binary, dedicated `127.0.0.1:27029`, replica set `qc-c1-rs`, and uniquely named disposable `qc_c1_test_*` / `qc_overview_test_*` databases. Guards reject Atlas, credentials, remote hosts and a supplied non-test DB name. C1 stock/concurrency, C2 ledger/refund-foundation and C3 lease/failure-recovery tests all ran without skips. SMTP acceptance is mocked; no provider delivery was attempted.

Earlier diagnostic runs exposed and were corrected for the session race, stale-period render, hidden retained Suspense trees in a test selector, and assertions executing before a lazy Shop was ready. The final totals above come from rerun suites, not those intermediate failing runs. A development StrictMode setup/cleanup can also create an aborted request before the replacement subscription; exact production request counts are measured against the built preview.

## Reproduce safely

Use existing dependencies and the already installed Playwright cache, or point `PLAYWRIGHT_MODULE_PATH` and `PLAYWRIGHT_CHROMIUM_EXECUTABLE` at your own installation. Do not load production server environment files for offline browser testing.

```powershell
npm.cmd --prefix client run lint
npm.cmd --prefix client run build
node scripts/check-frontend-budgets.mjs
node --test tests/*.test.mjs
node scripts/prelaunch-check.mjs
node scripts/audit-built-html.mjs
git diff --check
```

Start the local preview in a separate terminal:

```powershell
npm.cmd --prefix client run preview -- --host 127.0.0.1 --port 5175 --strictPort
```

In the test terminal:

```powershell
$env:QC_BROWSER_URL='http://127.0.0.1:5175'
$env:PLAYWRIGHT_MODULE_PATH='C:/Users/youss/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright'
$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE='C:/Users/youss/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe'
node --test --test-concurrency=1 tests/browser/*.browser.mjs
node scripts/frontend-accessibility.mjs after
node scripts/frontend-benchmark.mjs after
```

The benchmark's `before` mode requires the original preserved `.playwright/d1-baseline-dist`; do not copy the new build over that baseline. These artifacts are ignored by Git. The benchmark and browser suite block external traffic and mock `/api/*`; a manually opened preview does not provide an isolated API or an authenticated admin session by itself.

For the backend, follow the existing C1/C3 local-replica setup. The exact commands used here were:

```powershell
& ./.playwright/mongo/bin/mongod.exe --dbpath .playwright/mongo/c1-rs-data --bind_ip 127.0.0.1 --port 27029 --replSet qc-c1-rs --setParameter enableTestCommands=1 --logpath .playwright/mongo/c1-rs.log
# In another terminal, while that dedicated local process is running:
node server/testing/init-local-replica.js
$env:QC_COMMERCE_TEST_MONGO_URI='mongodb://127.0.0.1:27029/?replicaSet=qc-c1-rs'
$env:QC_OVERVIEW_TEST_MONGO_URI='mongodb://127.0.0.1:27029'
npm.cmd --prefix server test
```

Do not substitute Atlas. The test helper creates and drops only its own unique disposable databases. Do not run bootstrap or seed scripts.

## Manual browser checklist

1. Use a local isolated API/fixture setup. Open Home, Shop, an available product, Cart, Login, About and policy routes directly; refresh each. Repeat under `/ar`. Verify loading never disables the shared header/footer language/navigation controls.
2. In DevTools disable browser cache and filter Network to JS. Home must not request CatalogAdmin, AdminOverview, AdminOrders, StoreSettingsAdmin or MediaEditor. Open an authorized admin session in the isolated setup; each panel loads on demand. A guest/customer must be redirected without analytics requests.
3. Click header/footer logos from About, Shop, Cart and Admin. Click the Home logo while scrolled down. Verify one correct active nav item; Back/Forward restore the intended route/scroll; Shop query parameters and product URLs remain correct.
4. At 320/390 px open the drawer, cycle Tab/Shift+Tab, press Escape and verify focus returns to the trigger. Reopen and switch language. Verify closure, stable hamburger placement, centered logo, flag/locale and query/fragment preservation.
5. Tab from the address bar to the skip link and activate it. Tab to Shop search and see the gold focus outline. Check forms and retry controls using only the keyboard.
6. With normal motion, pause/resume the marquee by keyboard and pointer; inspect its loop at several widths. Enable reduced motion: the announcement is static, its pause button is hidden and Hero does not load ScrollTrigger.
7. Block a catalog API request or return invalid JSON. Verify an explicit error/retry rather than fabricated products/counts. Restore it and retry. Rapidly change Shop filters; old reads must abort and cannot replace newer results.
8. Block an actual product image URL. Verify a stable coffee-icon fallback, no fake photo, no retry loop and no gallery-height jump. Inspect desktop/mobile hero `currentSrc`; the existing correct WebP should be selected.
9. Add a fixture product with a selected size/grind to Cart and change/remove quantities. A nonempty cart still validates fresh server prices/stock; empty Cart does not call `/commerce/cart`. Do not place a real order.
10. In isolated Admin open Overview/Orders/Products/Categories/Settings, including direct tab links. Categories must not fetch Products. Change chart period: no old series under the new label. Refresh operational health: no finance reload; change range: no health reload. Reconciliation stays on demand. Check explicit loading/error/empty states.
11. Block a lazy route JS chunk, navigate to that route and verify the localized error, working shared shell, and explicit reload recovery after unblocking. Do not expect React to retry its cached failed import automatically without reload.
12. Inspect 768 px/tablet and desktop, plus Arabic Settings forms. Check 200% zoom and real assistive technology manually before launch. Review screenshots and measure again with real fonts/media during D2.

## Remaining D2 work and review artifacts

The work does not certify launch readiness. D2 should measure authorized deployed conditions/field vitals, real Google Font behavior, physical phones/touch, browser diversity and screen readers; evaluate self-hosted/subset fonts only with licensing and appearance checks; measure GSAP's remaining Home cost and any further critical-path opportunities; verify owner-supplied images before choosing responsive derivatives; and profile complex live catalog/admin sessions if real data demonstrates expensive rendering. Do not infer backend/commerce performance from the mocked API timings here.

Cold account/admin navigation has additional chunk latency. Product stock and financial data deliberately remain fresh. Some small layout shifts can remain in asynchronous lists even below the 0.10 lab target; this is not a zero-CLS guarantee for all data, fonts or viewport conditions. Browser EventTiming samples do not establish field INP.

Machine-readable before/after data: `.playwright/d1-before.json`, `.playwright/d1-after.json`. Final logs: `.playwright/d1-backend.txt`, `.playwright/d1-all-browser-final.txt`, `.playwright/d1-source-tests.txt`, `.playwright/d1-a11y-after-log.txt`, `.playwright/d1-build.txt`, `.playwright/d1-prelaunch.txt`, `.playwright/d1-html-audit.txt`, and the two dependency-audit JSON files. The review-only patch is `.playwright/d1-review.diff`; final status and diff summary are `.playwright/d1-git-status.txt` and `.playwright/d1-diff-summary.txt`. Those local artifacts are intentionally ignored, not committed.

<!-- D1_GIT_START -->
Branch `main`, HEAD `8a6e2e1`: **20 D1 tracked files modified and 11 D1 files created (31 total)**. The existing owner modification to `client/.env.example` is additional and unchanged. The D1 tracked diff is **156 insertions / 91 deletions**; the review patch also includes all 11 new files. No changes are staged.

All test-created databases were removed by their isolated helpers; the dedicated local MongoDB retained only `admin`, `config` and `local` before shutdown. The local Vite dev server, production preview and test replica set started for this work were stopped. Full Git status and the aggregate patch summary are saved in the review artifacts named above.
<!-- D1_GIT_END -->
