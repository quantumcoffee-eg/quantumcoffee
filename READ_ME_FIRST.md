# Quantum Coffee — Phase 2C: production connection preparation

**This patch changes only deployment configuration and API readiness logic. It does NOT create accounts or deploy services.** Do not apply it to Tap & Wrap.

## Install

1. Back up or commit any local changes before replacing matching source files.
2. Open the ZIP and copy its listed `client`, `server`, `docs`, and `render.yaml` files into `C:\Users\youss\Projects\quantum-coffee`.
3. **Never overwrite** your existing `server/.env` with `.env.example`; there is no actual `.env` in this patch.
4. Keep your existing `client/public/media/hero/` and design files; the patch does not contain them.
5. In PowerShell:

```powershell
cd C:\Users\youss\Projects\quantum-coffee\server
npm.cmd test
npm.cmd run dev
```

Local development without `MONGODB_URI` still serves `/api/health` for the UI.
`/api/ready` returns HTTP 503 until a database is connected; that is correct.

## After testing, commit your EXISTING local repo

```powershell
cd C:\Users\youss\Projects\quantum-coffee
git status --short
git add .
git status --short
# Make sure no secrets or .env files are staged.
git commit -m "Prepare isolated Quantum Coffee production deployment"
git push -u origin main
```

If this is your initial push and Git reports no upstream branch, the command above handles it.
If you have no `package-lock.json` in each client/server folder, run `npm.cmd install` there first and commit the generated lockfiles; both Render and Cloudflare are configured to use `npm ci`.

## The key decision

Only one real MongoDB database: `quantumcoffee_production`. No staging database or preview infrastructure. Do not connect Quantum Coffee to Tap & Wrap resources. The Render Blueprint is inert until you explicitly deploy it in a **new Quantum Coffee Render workspace**.

See `docs/PRODUCTION_WIRING.md` for the complete variable checklist and remaining features that must be implemented before a real commerce launch.
