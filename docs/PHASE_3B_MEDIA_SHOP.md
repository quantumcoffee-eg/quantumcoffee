# Quantum Coffee — Phase 3B: Media, public catalog and product pages

## Scope and safety

- Dedicated Quantum Coffee resources only. **Do not reuse Tap & Wrap credentials, buckets, clusters or domain**.
- All new products start as drafts. Publication requires a verified image, an active category, a configured HTTPS public image domain, and an explicit admin save. **Buying remains disabled** until Phase 4 commerce is complete.
- No staging DB is required; no production resources are created by this patch. Authentication and catalog data won't work until a Quantum Coffee Atlas Free database is connected.
- The optional R2 integration stays inactive until variables are configured.

## Required dependency install

`server/package.json` now declares `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`.
Run `cd server && npm.cmd install` locally. Commit the updated `server/package-lock.json` together with the source. Don't run `npm audit fix --force` automatically.

## Required Quantum Coffee R2 settings (later)

- `R2_ACCOUNT_ID` — Quantum Coffee's Cloudflare account ID
- `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` — **new**, bucket-scoped credentials for Quantum Coffee's public media bucket only
- `R2_PUBLIC_BUCKET` — a separate bucket exclusively for Quantum Coffee catalog imagery
- `R2_PUBLIC_BASE_URL` — HTTPS root, preferably a custom media subdomain attached to that bucket, without a trailing slash

Keep R2 keys only in `server/.env` locally or Render Environment for production. Never use `VITE_` prefixes for credentials, never commit them, and never put R2 credentials in the frontend.

**Bucket browser CORS rule:** Set allowed origins to your actual storefront origins (e.g., `http://127.0.0.1:5173` locally and the later Quantum Coffee HTTPS domain), allowed methods `PUT` (and `GET`/`HEAD` if required for browsing), allowed headers including `Content-Type` and `x-amz-*` (the SDK presigner may include these), and expose `ETag`. Do not configure a wildcard origin for a production bucket. Configure the public domain separately; a private R2 API endpoint isn't the public image CDN.

## Upload process

1. Admin creates a category/product **draft** in the dashboard.
2. Admin selects a JPEG, PNG or WebP image up to 5 MB (prefer compressed WebP under ~400 KB).
3. The backend checks the authenticated administrator and issues a short-lived R2 PUT URL for an unpredictable `catalog/<40 hex chars>.webp|jpg|png` object key.
4. Browser uploads the binary **directly** to R2 (not through Render) and asks the API to verify.
5. The API checks R2 object size, content type, and file signature bytes, then marks the object verified.
6. Only verified image keys can be attached to a category or product, via revision-protected API calls. Product gallery images can be reordered or unlinked.
7. To publish, an admin must have at least one verified gallery image, activate the category, and save product status `published`. Checkout is still disabled.

The uploaded objects are not automatically deleted when unlinked. Before launching or large-scale usage, implement cleanup of orphaned/unconfirmed catalog objects, which prevents gradual R2 storage growth. User-supplied images are not resized on the backend: optimize assets before uploading. This release does not generate thumbnails or automatic WebP variants.

## API routes

- `GET /api/catalog/categories`
- `GET /api/catalog/products?q=&category=&availability=in_stock&minPrice=<piastres>&maxPrice=<piastres>&sort=discover|newest|price_asc|price_desc&page=1`
- `GET /api/catalog/products/:slug`
- `POST /api/admin/media/intent` body `{ "contentType":"image/webp", "size":1234 }`
- `POST /api/admin/media/:id/confirm`
- `PATCH /api/admin/catalog/categories/:id/image` body `{ "revision":0, "imageKey":"catalog/...webp" }`
- `PATCH /api/admin/catalog/products/:id/images` body `{ "revision":0, "imageKeys":["catalog/...webp"] }`
- Existing admin catalog GET/POST/PATCH/DELETE routes remain; product publication now supported with the safeguards above.

## Local verification (before publishing any images)

```powershell
cd C:\Users\youss\Projects\quantum-coffee\server
npm.cmd install
npm.cmd test
npm.cmd audit
cd ..\client
npm.cmd run lint
npm.cmd run build
```

Then, once the dedicated Atlas + R2 details exist, manually check: blocked unauthenticated uploads; blocked malformed files; successful upload/confirm; category thumbnail; product gallery and reordering; draft isn't public; published item appears in EN/AR shop and featured/home; filtering/sorting; comparing prices; invalid CORS; browser/network errors; and publishing requires active category plus images. These runtime tests **have not** yet run against real external services.
