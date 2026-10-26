# Quantum Coffee — deployment and prelaunch readiness (26 October 2026)

**Current state:** Quantum Coffee's owner-controlled repository is `quantumcoffee-eg/quantumcoffee` (`main`). The owner-owned free MongoDB Atlas project (`quantumcoffee-production`, cluster `qc-prod`) has been accessed locally, the admin was bootstrapped, and the initial Coffee Blends category and three product drafts were seeded. No production API/frontend deployment or live R2 upload has been verified.

**Do NOT use connected ChatGPT Render, Cloudflare, or Atlas actions for this project:** those connections may point to Tap & Wrap. All Quantum Coffee resources must be accessed from the owner's own accounts and project IDs. Never copy or send any `.env` file, Atlas URI, SMTP credential, or R2 secret.

## Current safety state

- `CHECKOUT_ENABLED=false`, `REGISTRATION_ENABLED=false`, and `ORDER_EMAILS_ENABLED=false` by default.
- The source still contains `ORDERING_IMPLEMENTED=false`; there is no real order acceptance.
- Indexing is intentionally blocked by `client/index.html` (`noindex,nofollow`) while catalog, policies, domain and SEO prerendering are incomplete.
- Category `coffee-blends` is hidden, and `black-hole`, `worm-hole`, `cosmic-dust` are unpublished drafts. Owner must approve final preparations, images, descriptions and stock before publication.
- MongoDB has no confirmed restore plan. Avoid destructive operations and take an encrypted manual export before consequential changes.

## Code verification — no billing required

From the repository root:

```powershell
node scripts/prelaunch-check.mjs
cd server; npm.cmd test; npm.cmd audit
cd ..\client; npm.cmd run lint; npm.cmd run build
```

The prelaunch script is **offline and read-only**. It checks code/configuration guardrails only, not a live deployment or actual MongoDB data. Do not interpret a green result as permission to launch.

## Render — owner's account, when approved

- Use `render.yaml` in the owner repository. The blueprint targets Frankfurt (close to the Atlas Frankfurt region), Starter plan, `server` root, `npm ci`, `npm start`, `/api/ready`, and **manual deployments** (`autoDeployTrigger: off`).
- Do not import the blueprint or manually create a service before owner billing approval. Do not reuse Tap & Wrap's workspace, environment groups, services, or credentials.
- Provide in the owner service's Environment settings: `MONGODB_URI` (Quantum Coffee only), `MONGODB_DB_NAME=quantumcoffee_production`, `PUBLIC_SITE_ORIGIN=https://<approved-domain>`, `CLIENT_ORIGIN=https://<approved-domain>`, `NODE_ENV=production`.
- Keep `REGISTRATION_ENABLED`, `CHECKOUT_ENABLED`, `ORDER_EMAILS_ENABLED`, `ALLOW_ADMIN_BOOTSTRAP` **false**. Never set `ADMIN_BOOTSTRAP_PASSWORD` on Render.
- Initial readiness is `GET /api/ready` (200 only with database connectivity). `GET /api/health` can still respond when MongoDB is disconnected; don't use it as a readiness gate.
- Use the production site and API as sibling hosts on the **same registered domain** (for instance `www.example.com` / `api.example.com`). Unrelated `pages.dev` and `onrender.com` hosts are not an adequate production cookie-auth setup.

## Cloudflare Pages — owner's account

- Owner repository `quantumcoffee-eg/quantumcoffee`, branch `main`; project root `client`.
- Build command: `npm ci && npm run build`. Output: `dist` (relative to `client`).
- In the Pages production environment, set `VITE_API_BASE_URL=https://api.<approved-domain>` (omit `/api` and trailing slash). Never commit values to `client/.env.example` without reviewing its local edits.
- `client/public/_redirects` enables SPA routes; `client/public/_headers` adds static-response safety headers and immutable caching for Vite's hashed `/assets/` files. These headers do not cover Render API responses or Pages Functions.
- Keep the `noindex,nofollow` HTML meta tag until final launch approval. **Do not publish a sitemap, add a canonical production domain, or allow indexing while the domain and product pages are unfinished.**

## R2 — awaiting owner's billing activation

- Create dedicated public product-media bucket and distinct **private** payment-proof bucket in the owner's Cloudflare account.
- Set the API's R2 credentials and bucket values in Render only (or local `.env` when doing a controlled local verification). Never use Tap & Wrap's keys or buckets.
- Verify bucket CORS, image size/type and signature validation, URL expiry, authorization for proof viewing, orphaned-upload cleanup and usage limits.
- Product drafts must remain unpublished until approved real photos can be uploaded and verified.

## Business settings — dynamic from admin dashboard

- Admin Settings controls approved contact details, phone and WhatsApp, shipping bands, payment receiver instructions, and bilingual policies.
- Currently shipping amount and payment receiver values are pending owner confirmation. Do not invent rates, policies, or payment numbers.
- COD, InstaPay and Vodafone Cash are the intended payment methods, but saving these values **does not activate checkout**.
- If delivery fees differ by governorate, extend the current two-band shipping model before opening orders.

## SMTP, SEO, Meta, and launch authorization

- A real verified-domain SMTP sender is required for registration, recovery mail and order notifications; do not assume inbound Cloudflare Email Routing is an outbound mail service.
- Before launch, add route-specific SEO metadata, indexable server-rendered/prerendered public pages, approved canonical URL, EN/AR `hreflang`, accurate sitemap, robots policy, and product/organization structured data. The current Vite SPA with `noindex` is **not** production SEO-ready.
- Meta Pixel/CAPI and consent/privacy compliance are separate unimplemented launch tasks; do not invent event IDs or activate tracking.
- A manual production transaction test must cover inventory decrement/restoration, idempotent checkout, guest tracking, customer orders, private R2 proof upload/review, SMTP and refund/cancellation rules. Keep ordering locked until owner explicitly authorizes launch and this review passes.
