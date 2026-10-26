# Quantum Coffee — Phase A: navigation and UI repairs

Base: owner repo `quantumcoffee-eg/quantumcoffee`, commit `3d20081` (Phase 9). Does not replace or require Phase 10 files. No `.env` files, dependencies, database writes, R2, Render or deployment changes.

## Corrected behavior

1. The header logo and footer logo both navigate to the language-appropriate Home page. Clicking Home while already there scrolls back to the top.
2. Navigating between routes restores the top of the page. Changing shop filters through `?` parameters does not disturb scroll. `#fragment` links scroll to their target.
3. Mobile drawer always closes on link clicks (even when already on a route), Escape, Back/Forward, and when widening the browser. The drawer traps keyboard focus while open and restores focus when closed via Escape/close buttons.
4. Language switching retains full route, query parameters and hash, including shop filters and admin tabs.
5. Announcement bar renders two identical measured groups with enough repeated text to cover the viewport, and loops exactly one group-width. Layout recalculates on resize and font metrics changes. Reduced-motion users see a nonanimated announcement.
6. The admin image editor updates media references and revision without replacing unsaved product/category form fields. This avoids the EGP-versus-piastres form corruption.
7. Cart changes update an immediate ref before React rerenders, preventing fast clicks from being accepted using stale quantities. Other-tab storage events are synchronized.
8. Product page resets its cart-success state on a new slug, chooses an in-stock size/grind first, displays the selected combination's stock and shows a message when the cart can't accept an addition.

## Install

Extract the ZIP at `C:\Users\youss\Projects\quantum-coffee` preserving relative paths. Do **not** replace `.env` or `.env.example` (not included in the ZIP). Before installation, commit the already-verified separate Phase 10 audit if desired.

## Verification commands (PowerShell)

```
cd C:\Users\youss\Projects\quantum-coffee
node --test tests/ui-regressions.test.mjs
node --test tests/seo-values.test.mjs tests/static-heads.test.mjs tests/built-html-audit.test.mjs
node scripts/audit-built-html.mjs
node scripts/prelaunch-check.mjs
cd client
npm.cmd run lint
npm.cmd run build
cd ..\server
npm.cmd test
npm.cmd audit
cd ..
git status --short
git diff --check
```

Note: run `node scripts/audit-built-html.mjs` **after** `npm.cmd run build` if the `dist` output is missing. The above order assumes you already built Phase 10 successfully. Otherwise move it after the new build.

## Essential browser checks (no payment or production resources required)

Run backend (`server`: `npm.cmd run dev`) and frontend (`client`: `npm.cmd run dev`) in separate terminals. Use a normal and a mobile-size browser. Test:

1. Scroll down on Home, click header logo: returns to top even though the route is unchanged.
2. On Shop, About, and legal pages click header and footer logos: lands on EN or AR Home at the top. Link hit areas remain clickable.
3. Open hamburger drawer and click every navigation link, including the active one: drawer closes. Escape closes it; keyboard Tab stays within the open drawer. Switch EN/AR from drawer, then repeat.
4. On `/shop?sort=price_asc`, switch language: `?sort=price_asc` is retained. On `/admin?tab=products`, switch language: the Products tab stays selected.
5. Let the announcement bar run for several full cycles on desktop and mobile. It must move continuously, not pause, disappear, or snap. Resize the viewport; then test reduced-motion OS setting (text remains visible without animation).
6. Open a published product page when real catalog media is available. Change selected size/grind, verify stock status changes, add two quantities quickly and verify the cart never exceeds 20 of one variant. There must be no success message after navigating to a different product.
7. Once a dedicated Quantum R2 bucket is configured, edit an existing product, change an unsaved name/price, upload or rearrange an image, then check the name/price remains intact before saving.

## Outstanding, not included

- This update is **not** a full Playwright browser automation suite. Tests included here exercise core pure logic and source contracts; cross-browser QA is still necessary.
- Admin Overview/dashboard, payment lifecycle and refunds, R2 live integration, live SEO, production deployment, delivery fees and owner data will be handled separately.
- Checkout and registration must remain disabled.
