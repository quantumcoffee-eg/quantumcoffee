# Quantum Coffee — Phase 8: Bilingual SEO foundations (PRELAUNCH)

Based on owner repository `quantumcoffee-eg/quantumcoffee`, commit `6c7e21e`.
This patch DOES NOT enable indexing, checkout, registration, order emails, or deployment.

## Install

Copy the files from this ZIP into `C:\Users\youss\Projects\quantum-coffee` with the same directory structure.
Do not replace `client/.env`, `server/.env`, or the locally edited `client/.env.example`.

Run from repository root:

```powershell
node --test tests/seo-values.test.mjs
node scripts/generate-sitemap.mjs
node scripts/prelaunch-check.mjs
cd server
npm.cmd test
npm.cmd audit
cd ..\client
npm.cmd run lint
npm.cmd run build
```

The current static `client/index.html` still says `noindex,nofollow`, and
`client/public/_headers` additionally sends `X-Robots-Tag: noindex, nofollow`.
These must remain in place until a separate owner-approved launch review.

## Features prepared

- Bilingual page titles / descriptions updated on React Router navigation.
- Canonical URLs and hreflang (`en`, `ar`, `x-default`) only when a real HTTPS
  site origin has been configured through `VITE_PUBLIC_SITE_ORIGIN`.
- Product metadata uses actual published product data returned by the catalog API.
- Internal/private, unknown, and unavailable-product routes receive no canonical links.
- No Product Offer structured data while checkout is disabled.
- Pure sitemap generator filters to approved published products with active
  categories, actual images and meaningful English descriptions.
- Sitemap generation is offline and preview-only unless a later launch removes
  the existing global noindex locks and the operator explicitly requests writing.

## Important: this is NOT server-rendered SEO

The React SPA changes metadata in the browser. Search engines and social preview
bots may not execute the JavaScript. Before promoting this to an indexable shop,
implement and validate HTML-at-request (SSR, pre-render or equivalent) for
published product pages; then check raw HTML using curl, Google Rich Results Test,
Google URL Inspection, and social preview tools. Do not advertise it as complete
product SEO until then.

## Domain and products pending

Do not invent a domain. Once approved, supply `VITE_PUBLIC_SITE_ORIGIN` in the
owner's Cloudflare Pages production environment, for example `https://YOUR-REAL-DOMAIN`,
without a trailing slash. This is a public variable; it is not a secret.
The currently seeded products are drafts, so none belongs in the sitemap yet.

Future sitemap example (after launch approval and an exported *public-only* JSON
catalog with `{ "categories": [...], "products": [...] }`):

```powershell
node scripts/generate-sitemap.mjs --origin=https://YOUR-REAL-DOMAIN --source=approved-catalog.json
```

This command previews the URL count. `--write=approved` refuses to write while
prelaunch indexing locks remain, by design. The final production process must
regenerate the sitemap when the approved catalog changes.

## Operational note

The original `client/.env.example` was already modified locally by the developer.
This patch intentionally does not include that file. No MongoDB connection,
Cloudflare R2, or Render service is touched.
