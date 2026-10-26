# Quantum Coffee — prelaunch guardrails patch

This patch applies to the verified owner repository `quantumcoffee-eg/quantumcoffee`, commit `fd3d97c`.

## Changes

- `render.yaml`: correct owner repository, Frankfurt region, flags disabled, manual deploy only. **Does not deploy anything.**
- `client/public/_headers`: safe Cloudflare Pages response headers; long-lived caching for Vite hashed assets.
- `scripts/prelaunch-check.mjs`: offline source/config audit, no network calls or database writes.
- `docs/PRODUCTION_WIRING.md`: replaces obsolete references to the old GitHub repository, pre-feature documentation, and stale rollout statements.

## Install

Extract this ZIP at `C:\Users\youss\Projects\quantum-coffee`. It does **not** include either `.env.example` file; keep your existing local changes and all secrets untouched.

Run from repository root:

```powershell
node scripts/prelaunch-check.mjs
cd server
npm.cmd test
npm.cmd audit
cd ..\client
npm.cmd run lint
npm.cmd run build
cd ..
git status --short
git diff --check
```

A successful prelaunch check is NOT launch authorization. Checkout, R2, SMTP, domain and SEO prerequisites are still pending. Do not import the Render blueprint into any connected Tap & Wrap account.
