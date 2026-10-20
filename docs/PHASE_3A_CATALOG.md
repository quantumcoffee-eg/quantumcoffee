# Quantum Coffee — Phase 3A Catalog Administration

Scope: standalone Quantum Coffee Product/Category schemas, validation, admin CRUD and initial admin screen.

## Safety rules
- All provider accounts currently connected to ChatGPT belong to Tap & Wrap; **do not connect Quantum Coffee to them**.
- No provider configuration is changed by this patch.
- Product creation defaults to drafts; publication intentionally fails until R2 upload keys can be verified server-side.
- No staging database is introduced. Keep public ordering disabled until commerce security is finished.
- No backups are configured. This makes destructive operations especially risky; a manual encrypted export before the first live release remains strongly advised.

## Endpoints
Public (no purchase capabilities yet):
- `GET /api/catalog/categories` — active categories
- `GET /api/catalog/products?q=&category=&sort=&page=` — published products only, 20 per page
- `GET /api/catalog/products/:slug` — published product details only

Admin (requires authenticated admin session and connected database):
- `GET|POST /api/admin/catalog/categories`
- `PATCH|DELETE /api/admin/catalog/categories/:id`
- `GET|POST /api/admin/catalog/products`
- `GET|PATCH|DELETE /api/admin/catalog/products/:id`

Money uses integer **piastres** in the API and EGP in the editor. Both models keep stable slugs; rename does not change the URL. `revision` is used for optimistic concurrency checks. Product DELETE archives it rather than deleting it; a category with any linked products cannot be deleted.

## Apply
Extract the Phase 3A patch **into the repository root**, preserving directories. Do not replace `server/.env`. Existing branding assets and production variables are untouched.

Run the following after extraction:
```
cd server
npm.cmd test
npm.cmd audit
cd ..\client
npm.cmd run lint
npm.cmd run build
```

Then start both servers. Access `/admin?tab=categories` while logged in as a Quantum Coffee admin and after a Quantum Coffee MongoDB connection is configured. Until then, the catalog pages intentionally report that the service is unavailable. A successful unit test does not imply successful database CRUD; full integration testing must happen before any production use.

## Known follow-up work
1. Quantum Coffee MongoDB project/cluster and admin bootstrap (separate from Tap & Wrap).
2. Verified R2 uploads, image ordering and publishing flow.
3. Storefront product cards, individual product pages and live filters.
4. Orders and payment handling; customer checkout remains disabled.
5. Improve catalog editor validation and automated integration checks.

Do not mark a product publicly purchasable during this milestone.
