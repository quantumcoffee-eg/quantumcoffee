# Quantum Coffee: UI root-cause investigation and repair

Date: 2026-10-26. Local repository: `C:\Users\youss\Projects\quantum-coffee`.
Branch: `main`. Starting HEAD: `a5a777e` (`Add production HTML output audit`).
No commit, push, deployment, database connection, seed, bootstrap, or production mutation was performed.

## A. Confirmed causes and repairs

### 1. English logo destinations and duplicate active navigation

**Confirmed in the running browser before editing.** On `/about`, the header logo's rendered `href` was `/about`. Home and About both had `aria-current="page"`. A real click on the logo left the URL at `/about`. Hit testing reached the logo image itself, so an invisible overlay was not the cause in the reproduced case.

The cause was `LocaleProvider.url()` in `client/src/lib/i18n.jsx:25`: the previous expression returned `''` for English `/`. React Router resolves an empty destination against the current route. `NavLink end` could not fix that because Home's resolved destination was already the current route. Header/footer logos, Back to Home, product breadcrumbs, admin Return to storefront, and sign-out home navigation all consumed this helper.

**Repair:** make `url()` use the existing `localizedPath()` helper, which returns absolute `/` or `/ar`. Keep the existing Router links and Home's exact matching. No extra logo wrapper, z-index increase, or click interception workaround was added.

Affected consumers: `client/src/components/Header.jsx`, `Footer.jsx`, `client/src/pages/OtherPages.jsx`, `ProductPage.jsx`, and `client/src/admin/CatalogAdmin.jsx`. Only the helper and shared header/footer behavior needed changes in this task; the page/admin consumers benefit without edits.

### 2. Same-page scrolling and browser history

The earlier patch's same-page comparison also received the empty English home URL, so it could not recognize Home correctly. Its header/footer scroll code was duplicated and explicitly requested smooth motion even under reduced-motion preference. Route effects always reset pathname navigation, with no saved position for Back/Forward.

**Repair:** `client/src/lib/navigation.js:5` owns shared same-page click behavior. Clean repeated destinations scroll without adding duplicate history entries. Modified clicks retain native new-tab behavior. Query strings can be cleared by Router navigation, fragment removal is handled after the Router commit, and reduced motion uses immediate scrolling.

`client/src/components/NavigationEffects.jsx:6` is the single route-scroll owner. It saves up to 100 history-entry positions in memory, restores them for Back/Forward, starts new pages at the top, follows existing fragment targets, and retains scroll for query-only filters. Native history restoration is temporarily set to manual and restored on cleanup. Header navigation closes the drawer and returns focus to its toggle.

**Limit:** this is session-memory restoration, not persisted scroll restoration across a full browser reload. Exact restoration onto data-dependent content that has not loaded yet is not guaranteed; local history tests exercised fully rendered fixture/empty states. No production catalog or live order data was used.

### 3. Arabic marquee gaps

The current working tree already contained width-aware repeated groups; the attached audit's older two-copy diagnosis did not describe this version. However, only the track had `direction:ltr`. The announcement parent inherited RTL flex alignment and anchored the wide track to the right before a negative translation moved it farther left.

**Confirmed before editing:** at 390px, an Arabic track sample ended at x=317.5, leaving about 72.5px empty on the right. Automated sampling found gaps at 25%, 50%, 75%, and just before the loop boundary.

**Repair:** `client/src/components/AnnouncementBar.jsx:8` and `client/src/style.css:193` keep both track and viewport mechanically LTR while individual Arabic phrases remain RTL. Measure before first paint and keep the existing ResizeObserver-based width coverage. Two identical groups translate by exactly one group width, linearly and continuously. Remove obsolete announcement selectors/keyframes rather than adding another competing animation.

Replace only decorative stars with 13px Lucide Atom, Coffee, Orbit, Coffee icons using existing dependencies and gold styling. The original English/Arabic words remain unchanged. Duplicate visual content is hidden from assistive technology; one readable announcement is exposed. Reduced motion shows the full static copy with wrapping instead of a clipped moving strip.

### 4. Mobile language-change movement

**Confirmed before editing:** at a 390px viewport, the hamburger moved from x=19.1875 to x=335.8125 on EN to AR. It had no own transform or running CSS animation. The grid inherited document direction and automatically reversed physical columns. Separately, RTL drawer rules changed its anchor from left to right and its closed transform from -105% to +105% while the same drawer was closing with a transform transition. That combination explains the cross-screen motion risk; a separate hamburger animation was not reproduced.

**Repair:** `client/src/style.css:154` keeps the existing mobile arrangement physically stable in both languages: hamburger left, logo centered, account/cart right. Equal `minmax(0,1fr)` side columns retain centering on narrow screens. The drawer always opens/closes from that same left edge; Arabic text still inherits RTL. The existing smooth opening/closing transition remains. `client/src/lib/i18n.jsx:28` updates document language/direction before paint. `Header.jsx:80` hides the closed dialog from assistive technology as well as making it inert.

The prior patch's Escape, focus trap, backdrop close, route-change close, breakpoint close, and body-overflow cleanup were retained and browser-tested. Header position remains relative, as originally designed; no sticky-header redesign was introduced.

### 5. Nearby changes verified and retained

The initial working tree already included the product selected-stock fix, product notice reset, admin media/draft merge, atomic cart additions, filter-preserving language switch, category translation, and role-aware footer orders link. These were inspected independently and retained. Browser tests verified chosen-size stock, add-to-cart, product notice reset, category/product URLs, and admin media reorder followed by saving an unsaved name/price with the updated revision. Unit tests cover media merges and rapid cart additions. Their implementation files were not rewritten in this task.

GSAP animations are scoped to the hero and its media/copy refs; no header animation or global preventDefault handler was found. Actual click tests exercised header/footer/navigation across representative routes and sizes. That evidence does not establish absence of every possible overlay in untested live content.

## B. Files and architecture

Changed during this task (several already had local changes at entry):

- `client/src/lib/i18n.jsx`: absolute localized URLs and pre-paint document direction.
- `client/src/lib/navigation.js`: new shared same-page click helper.
- `client/src/components/Header.jsx`: shared click helper, drawer focus return and closed-dialog visibility.
- `client/src/components/Footer.jsx`: same shared click behavior.
- `client/src/components/NavigationEffects.jsx`: history-aware route scrolling.
- `client/src/components/AnnouncementBar.jsx`: phrase icons, phrase direction and pre-paint sizing.
- `client/src/style.css`: stable mobile control/drawer placement, corrected marquee anchoring, reduced-motion display, obsolete announcement CSS removal.
- `tests/ui-regressions.test.mjs`: URL edge cases and same-page/modified-click/reduced-motion unit coverage.
- `tests/browser/navigation.browser.mjs`: new real-click browser suite with fully intercepted APIs.
- `UI_REPAIR_REPORT_2026-10-26.md`: this report.

No dependencies or package/lockfile changes. Browser tests use the already cached Playwright runtime and existing Chromium executable. The report and browser suite are the only new tracked-intent artifacts besides the navigation helper; the other untracked Phase A files existed at entry.

Preserved byte-for-byte against session-entry snapshots: `client/.env.example` and all four Phase 10 audit files. Also preserved the existing App, admin, cart, product-selection and pure helper changes. No business, backend, hosting, security, checkout, registration, mail, policy, product content, or noindex configuration changed.

## C. Verification

| Check | Result |
|---|---|
| Initial focused browser regressions before repair | 0/5 passed; all 5 failures reproduced the defects |
| Final full Chromium browser suite against local Vite | 39/39 passed |
| Targeted browser checks against the final production preview | 8/8 passed, including nested refresh and Back/Forward |
| Root unit/SEO/static-head/audit regressions | 23/23 passed |
| Existing server tests | 52/52 passed |
| Frontend ESLint | Passed |
| Production build and static-head generation | Passed; 14 protected public HTML heads generated |
| Offline prelaunch checker | 18/18 passed |
| Built HTML audit | 14/14 public routes passed; HTML and Pages noindex verified |
| Git whitespace check | Passed |

The first build/dev attempts failed because sandboxed esbuild could not read parent directories. The same commands succeeded outside the filesystem sandbox after automatic approval. This was an environment access failure, not a source compilation failure.

The full suite covers real clicks on header/footer logos, repeated desktop/mobile nav selections, Home/About active states, account/cart links for guest/customer/admin fixtures, Back/Forward with scroll restoration, refresh of nested routes, both language directions, query/hash/admin-tab preservation, keyboard focus/Tab/Escape, backdrop close, same-route close, responsive cleanup, reduced motion, modified-click new tabs, and product/admin form regressions.

Responsive marquee geometry is sampled at 41 points through a cycle and at the restart boundary, in English and Arabic, at widths **320, 375, 768, 900, 901, 1024, 1440, 1920, 2560, 3440px**. Tests check matching group widths, viewport coverage, vertical text fit, icon alternation, real-time movement, no horizontal page overflow, centered mobile logo, and non-overlapping controls. Language-change tests sample hamburger and closing-drawer positions over time. Desktop/mobile layout screenshots were inspected locally.

Browser evidence/logs are in the ignored `.playwright/` directory. The full final run is `.playwright/browser-results.txt`; built-preview results are `.playwright/preview-results.txt`. Test fixtures use `.invalid` identities and in-memory request interception. External traffic is blocked, and no backend is started by the suite.

Not verified: hosted Cloudflare/Render responses, real authenticated sessions/cookies, real R2 uploads, checkout/payment/order creation, production database transactions, Safari/Firefox, or physical devices. Vite's local fallback plus the built redirect-file audit do not prove a deployed CDN's fallback behavior. No production deployment was attempted.

### Repeat the automated checks

From the repository root, run:

```powershell
node --test tests/*.test.mjs
npm.cmd test --prefix server
npm.cmd run lint --prefix client
npm.cmd run build --prefix client
node scripts/prelaunch-check.mjs
node scripts/audit-built-html.mjs
git diff --check
```

Start only the local frontend in one terminal:

```powershell
npm.cmd run dev --prefix client -- --port 5174 --strictPort
```

In another terminal, use the existing Playwright installation. If Playwright is not resolvable from this repository, point the variables below at your installed/cached runtime and Chromium. No dependency installation is performed by the test file.

```powershell
# Optional when the runtime is outside this repository:
# $env:PLAYWRIGHT_MODULE_PATH = 'C:/path/to/node_modules/playwright'
# $env:PLAYWRIGHT_CHROMIUM_EXECUTABLE = 'C:/path/to/chrome.exe'
node --test tests/browser/navigation.browser.mjs
```

For a local production preview, run `npm.cmd run preview --prefix client -- --host 127.0.0.1 --port 4174 --strictPort`, set `$env:QC_BROWSER_URL='http://127.0.0.1:4174'`, and rerun the browser test file. The suite refuses non-loopback targets and fulfills all API requests in memory.

## D. Manual local browser checklist

1. Run the Vite frontend and open `http://127.0.0.1:5174/about` at 1440px. Confirm only About is underlined. Click the header logo: URL `/`, hero visible, only Home active.
2. Scroll Home down, then click its header logo and footer logo separately. Both return smoothly to the top. Repeat on Home with `?preview=1` and `#categories`; clean home links clear those suffixes.
3. Click Home, Shop, About, Track Order, account and cart, including repeated selections. Use all footer policy/quick links and About's Back to Home. Check browser Back/Forward and refresh `/about`, `/shop?sort=newest`, and a real published product URL when available.
4. At 390px and 320px, open the menu, choose each link and reselect the current link. It closes and body scrolling works again. Test close button, backdrop, Escape and Tab/Shift+Tab. Resize an open mobile menu above 900px; the backdrop and body lock must disappear.
5. Switch EN to AR from the mobile drawer, then AR to EN. Hamburger stays left; logo stays centered; account/cart stay right; the drawer closes toward the same left edge. Arabic text remains RTL. Repeat on Shop with filters and a fragment; repeat desktop switching and footer language switching.
6. Watch the marquee through a full loop in both languages. Resize through 375, 768, 900/901, 1440 and 1920px. Check no empty strip, restart jump or vertical clipping. Icons alternate atom/cup/orbit/cup. Enable reduced motion in browser rendering settings: full static copy, no marquee animation.
7. With a previously authorized local admin session, check header logo and Return to storefront from `/admin?tab=products`. Review the existing unsaved-draft/media behavior only against approved test services; this task's automated admin mutation test was entirely mocked.
8. Check hover/focus outlines and Ctrl-click the logo to open home in a new tab. Do not enable checkout/registration or alter launch protections while checking UI.

## E. Git review

The working tree remains intentionally uncommitted. Existing unrelated modifications were not discarded. The final status and tracked diff summary are recorded below after verification. Review the local diff before any commit; `.env.example` is a pre-existing owner change, not part of this repair.

```text
 M client/.env.example
 M client/src/App.jsx
 M client/src/admin/CatalogAdmin.jsx
 M client/src/admin/MediaEditor.jsx
 M client/src/commerce/CartProvider.jsx
 M client/src/components/Footer.jsx
 M client/src/components/Header.jsx
 M client/src/lib/i18n.jsx
 M client/src/pages/ProductPage.jsx
 M client/src/style.css
?? READ_ME_PHASE_A_UI_REPAIRS.md
?? UI_REPAIR_REPORT_2026-10-26.md
?? client/src/admin/media-draft.mjs
?? client/src/commerce/cart-values.mjs
?? client/src/components/AnnouncementBar.jsx
?? client/src/components/NavigationEffects.jsx
?? client/src/components/announcement-values.mjs
?? client/src/lib/navigation-values.mjs
?? client/src/lib/navigation.js
?? client/src/pages/product-selection.mjs
?? tests/browser/
?? tests/ui-regressions.test.mjs
```

Tracked diff summary (includes earlier local changes; excludes untracked files):

```text
 client/.env.example                  |   4 --
 client/src/App.jsx                   |   3 +-
 client/src/admin/CatalogAdmin.jsx    |   2 +-
 client/src/admin/MediaEditor.jsx     |   4 +-
 client/src/commerce/CartProvider.jsx |  84 +++++++++++++++++----------
 client/src/components/Footer.jsx     |  23 ++++++--
 client/src/components/Header.jsx     | 109 +++++++++++++++++++++++++----------
 client/src/lib/i18n.jsx              |  13 +++--
 client/src/pages/ProductPage.jsx     |  19 +++---
 client/src/style.css                 |  41 +++++++++++--
 10 files changed, 209 insertions(+), 93 deletions(-)
```

A cumulative review patch is saved locally at `.playwright/final-working-tree.patch`, including untracked source/test/report files and excluding the pre-existing `.env.example` change. Temporary browser logs, screenshots and entry snapshots remain ignored.

