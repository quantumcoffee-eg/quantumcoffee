# Quantum Coffee — Phase 9: Build-time public HTML metadata

This patch builds on Phase 8 (which should be committed first). No external account, MongoDB data, or domain is needed.

## Why

Phase 8 sets page-specific SEO metadata in the browser only. This patch gives
Cloudflare Pages a separate static HTML *head* for each known EN/AR public route,
so titles and descriptions are present in the initial response before React runs.
The body remains the ordinary Vite SPA root. **This is NOT prerendered React
content, dynamic product HTML, indexable SEO, or live-deployment approval.**

## Install

Extract into `C:\Users\youss\Projects\quantum-coffee` and preserve all `.env`
files. Files changed: `client/package.json`, `scripts/prelaunch-check.mjs`.
Files added: `scripts/generate-static-heads.mjs`, `scripts/seo/static-head-values.mjs`,
`tests/static-heads.test.mjs`, and this README. No `package-lock.json`
modification or new dependency is required (only the npm build command changes).

## Verify locally

```powershell
cd C:\Users\youss\Projects\quantum-coffee
node --test tests/seo-values.test.mjs tests/static-heads.test.mjs
node scripts/prelaunch-check.mjs
cd client
npm.cmd run lint
npm.cmd run build
Test-Path .\dist\ar\shop\index.html
Test-Path .\dist\shop\index.html
Get-Content .\dist\ar\shop\index.html -TotalCount 15
cd ..\server
npm.cmd test
npm.cmd audit
cd ..
git status --short
git diff --check
```

Expect **9 SEO tests**, **18 prelaunch source checks**, the normal full server tests,
and a successful client build. The client build will print 14 `HTML HEAD:` lines
and should create `client/dist/ar/shop/index.html` and
`client/dist/shop/index.html`. Generated files under `dist/` are ignored by Git.

**Never** manually upload the build output to a live domain until launch
requirements are met. `noindex,nofollow` remains in the generated HTML and in
Cloudflare Pages response headers. No product/private routes are generated.

## Publish constraints

No product HTML is generated until the owner supplies approved images,
descriptions, and the domain and products are published. We will later implement
product request-time HTML or genuine static prerendering with current product
content, and recheck actual HTTP headers, indexing rules and social previews.
There are no changes to checkout, inventory, email, security controls, or APIs.

This patch deliberately does not edit the developer's local `client/.env.example`.
