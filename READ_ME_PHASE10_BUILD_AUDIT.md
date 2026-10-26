# Quantum Coffee — Phase 10: Built HTML Prelaunch Audit

Small offline verification patch built on Phase 9 (the 14-route static HTML metadata generator).

## Why

Phase 9's tests verify how HTML heads are generated. This additional audit checks the
**actual files in `client/dist`** after the Vite build, before any deployment.
It checks all 14 public English/Arabic HTML snapshots for title/description,
Open Graph data, Arabic direction, canonical/alternate URLs when a real HTTPS
origin is provided, and the prelaunch noindex tag. It also confirms that the
built Cloudflare `_headers` has `X-Robots-Tag: noindex, nofollow`, the SPA
`_redirects` file exists, and that no private route HTML or environment files
were bundled.

## Install

Merge this ZIP into the root of your existing `quantum-coffee` project **after
committing Phase 9**. These are four new files; none overwrite existing project
files. Do not copy `.env` to `client/public` or commit it.

## Run

```powershell
cd C:\Users\youss\Projects\quantum-coffee
node --test tests/built-html-audit.test.mjs
cd client
npm.cmd run lint
npm.cmd run build
cd ..
node scripts/audit-built-html.mjs
node scripts/prelaunch-check.mjs
cd server
npm.cmd test
npm.cmd audit
cd ..
git status --short
git diff --check
```

Expected final audit: `BUILT HTML AUDIT PASSED (14 public HTML routes).`

## Important limits

- No real production domain or product data has been used.
- This is a **read-only local build audit**, not a deployed HTTP test.
- Product pages are still dynamic client-side; product HTML snapshots are NOT created.
- It does not remove `noindex`, enable checkout, make a sitemap, or approve deployment.
- Continue using the Quantum Coffee owner's separate infrastructure; never reuse Tap & Wrap assets or credentials.
