# Quantum Coffee: Dynamic Size, Grind and Gallery Patch

**Base:** Your existing owner-repository project with the previously installed 250g/grind update, before that update is committed. Latest verified owner-repository commit before the 250g patch: ffc33be.

## What's included
- Per-product sizes: start each new product with 250g, add more sizes later via Admin > Products.
- Each size has its own price and compare-at price, supported grinds and stock count.
- Supports one size or many. The initial 3 known blends should have only 250g when created.
- Admin product photo gallery continues to use verified Cloudflare R2 objects; maximum increased from 12 to 24 photos. Add, reorder or remove images after R2 is configured. R2 isn't enabled yet.
- Storefront product detail, cart, quote and order snapshot preserve specific grams and grind choices.
- Server calculates prices from chosen size; client prices never determine checkout totals. Server keeps checkout hard-locked off.
- Backend refuses removing combinations referenced by any existing order, so cancellations can eventually restore inventory.
- Compatible read projection for older 250g product drafts (the admin can save to convert them to size collections). No automatic DB mutation.
- Disables compressed HTTP JSON request inflation as defense in depth; still upgrade body-parser from npm audit.

## Apply safely
1. First fix high-severity body-parser: `cd server; npm.cmd audit fix; npm.cmd audit; npm.cmd ls body-parser; npm.cmd test`.
2. Unzip the patch into `C:\Users\youss\Projects\quantum-coffee`, preserving folder structure. Existing `server/.env`, `client/.env.example`, `server/package.json` and `server/package-lock.json` are NOT included in this patch.
3. Run server `npm.cmd test` and `npm.cmd audit` and client `npm.cmd run lint` / `npm.cmd run build`.
4. `git diff --check`, inspect staged names, ensure no actual `.env` or secrets, then commit and push to owner repo.

## Catalog starting data — not inserted yet
- Black Hole: 250g 450 EGP; one size with grind options approved for this blend.
- Worm Hole: 250g 425 EGP; one size.
- Cosmic Dust: 250g 400 EGP; one size.
- Each supported grind for each initial 250g size begins with 10 bags. Verify owner-approved grind list before publishing.
- Turkish spiced / mahwaj is not priced differently within a size.
- Photos, descriptions, Arabic labels, shipping rates, payment receiver numbers, domain, policies are still owner-pending. Do not invent or publish placeholders.

## Verification limitations
Offline backend tests passed. Backend syntax and JSX parsing passed. Full Vite build and real MongoDB nested stock updates are **not verified here**; keep CHECKOUT_ENABLED=false and ORDERING_IMPLEMENTED=false. Live MongoDB + R2 + SMTP must be tested before launch.

## Historical data and future changes
New cart storage uses v3 because an older browser cart did not contain a size; the UI intentionally doesn't invent one. Existing session/order data is not modified automatically. Before any real data migration, inspect production records and prepare explicit, reviewed migration/backout steps. With no backups this is especially important.

## Security note
The Atlas URI with the password removed cannot connect; keep the complete URI only in `server/.env` (local) or Quantum Coffee owner's Render secrets (future), not in GitHub. Use a separate Quantum Coffee DB user and IP allowlist. Never reuse Tap & Wrap resources.
