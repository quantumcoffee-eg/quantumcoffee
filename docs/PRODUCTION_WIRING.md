# Quantum Coffee — production wiring checklist (no staging)

**Scope:** This document prepares the production connections. It does NOT mean the
store is ready to accept orders. Checkout, payments, catalog administration,
private R2 proofs, Meta tracking, and email workflows are not implemented yet.

## Resource isolation — non-negotiable

Do not reuse, connect to, or change Tap & Wrap's Cloudflare Pages/Workers, R2,
Render service/workspace, MongoDB project/cluster/database users, or credentials.
Create separate Quantum Coffee resources, even if you use the same provider login.
Name resources `quantum-coffee-*` wherever possible. Prefer separate Atlas
project and cluster, with database-scoped least-privilege credentials.

## 1. GitHub

Repository: `youssefkhaled222/quantum-coffee`. It was empty when last inspected.
The source of truth is the approved project on your local machine. Copy this
patch there, verify it, then commit and push from that local clone. Never push
server/.env, secrets, exports, or payment proof images.

## 2. Domain + DNS (when domain is purchased)

- Choose canonical public origin: `https://your-domain.example` or `https://www.your-domain.example`.
- Create `api.your-domain.example` as a Render custom domain.
- Configure redirects between apex and www, and HTTPS certificates on both.
- Use separate Quantum Coffee DNS zone and project entries.
- Browser cookies require the public site and API to be **same-site**; do not
  expect cross-site cookie auth between a `pages.dev` domain and `onrender.com`.

## 3. Render — separate Starter web service

- Use `render.yaml` **only in the new Quantum Coffee Render workspace**.
  It sets `plan: starter`, `rootDir: server`, `npm ci`, `npm start`,
  `/api/ready` health-check, and disables automatic deploys.
- Supply `MONGODB_URI`, `PUBLIC_SITE_ORIGIN`, and `CLIENT_ORIGIN` in the new
  service's secrets / Blueprint prompts.
- Required production settings:
  - `NODE_ENV=production`
  - `MONGODB_DB_NAME=quantumcoffee_production`
  - `MONGODB_URI=<new dedicated Atlas URI>`
  - `PUBLIC_SITE_ORIGIN=https://your-domain.example`
  - `CLIENT_ORIGIN=https://your-domain.example` (add www only if used)
  - `REGISTRATION_ENABLED=false`
  - `ALLOW_ADMIN_BOOTSTRAP=false`
- Do not copy Tap & Wrap's environment group.
- `GET /api/health` is liveness. `GET /api/ready` returns 503 if DB is down,
  preventing a disconnected application from being marked ready.
- Production boot fails fast if mandatory settings are invalid or Atlas fails.

## 4. Cloudflare Pages — new Quantum Coffee project

- Link ONLY `youssefkhaled222/quantum-coffee`.
- Project root / build directory: `client`.
- Build command: `npm ci && npm run build`.
- Build output: `dist` (relative to client root).
- Production environment variable:
  `VITE_API_BASE_URL=https://api.your-domain.example` (no trailing slash).
- Turn off automatic preview deployments if you don't want them; do not create
  a separate staging Pages project.
- `client/public/_redirects` serves SPA routes.
- The website currently emits `<meta name="robots" content="noindex,nofollow">`.
  Keep that until the whole site, SEO pages, policies and product content are
  approved. Later remove it deliberately and publish a sitemap.

## 5. MongoDB Atlas — NEW Quantum Coffee resources

- A separate Quantum Coffee Atlas project/cluster is preferred; Free tier
  is fine for initial usage when monitored.
- Create a new database user with permission for only Quantum Coffee's database.
- Set a secure connection URI and `MONGODB_DB_NAME=quantumcoffee_production`.
- Configure Atlas network access for Render connectivity; avoid broad allowlists
  if reliable narrower controls are possible. If `0.0.0.0/0` is unavoidable
  on this tier, use a strong least-privilege user and monitor access.
- Production database is the only environment; **no staging database**.
- Initial controlled bootstrap should be done locally against the NEW database.
  Never put ADMIN_BOOTSTRAP_PASSWORD in Render env or send it in chat.

## 6. Cloudflare R2 — NEW Quantum Coffee buckets, later

- Prepare one public product media bucket and a distinct private uploads bucket,
  or equivalent separation. Private payment proofs must never be public.
- Store credentials only in Render; use object-specific access controls and
  time-limited reads for authorized admins once upload features are implemented.
- Env placeholders are in `server/.env.example`; **R2 code is not yet active**.

## 7. Transactional email + Meta, later

- Receive: Cloudflare Email Routing to owner Gmail (domain MX records).
- Send: verified-domain SMTP service through Nodemailer (SPF, DKIM, DMARC).
- Mail transport exists but notification workflows and templates are not live.
- Meta Pixel + Conversions API require IDs, consent handling, server/client
  event deduplication, and privacy-safe payloads. Do not enable until built.

## 8. Direct-to-production safeguards

- No separate staging database requested; perform **minimum non-destructive
  production checks** before taking real orders: health/readiness, role guard,
  login/logout, admin CRUD with harmless test data removed before launch,
  zero-cost/controlled checkout scenario, payment proof privacy, and Meta consent.
- Until commerce is implemented, do not advertise this as a live store or accept
  money/orders through unfinished UI. Registration remains disabled.
- No database backup requested: be aware free-tier database loss, accidental
  deletion or corrupt data may be **irrecoverable**. Even if avoiding scheduled
  backups, take a manual export before destructive schema/catalog changes and
  after real customer data begins accumulating. Store it encrypted off-cluster.
- The Render service uses no persistent disk; uploaded files must go to R2.

## Later: Go-live checklist

Confirmed owner content + policies; product and category admin; secure orders;
order idempotency; delivery fees; COD/InstaPay/Vodafone Cash; private proof
verification; emails; legitimate reviews; tracking consent; SEO prerender/
structured data/sitemap; rate limiting and abuse handling; customer support;
basic accessibility and mobile/browser testing; launch authorization.
