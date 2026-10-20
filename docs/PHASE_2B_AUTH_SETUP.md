# Quantum Coffee — Phase 2B authentication foundation

## What this patch does

- Preserves the approved Phase 2A dark desktop/mobile hero and homepage.
- Adds MongoDB models for `User` and `Session` with a unique email index and session expiration.
- Passwords use salted `scrypt` hashes, never plaintext.
- Session cookies are opaque, HttpOnly, SameSite=Lax, and Secure in production.
- Includes account login/logout, optional development signup, `/api/auth/me`, and an admin-only permission check.
- Role-based navbar works: guests/admins see **Track Order**, customers see **My Orders**. Admin profile leads to `/admin`.
- `GET /api/health` exposes only database readiness, not credentials.
- No actual order/payment/product CRUD endpoints yet. Login/signup pages are not a claim that checkout is ready.

## Installation onto an existing project

1. **Keep your own `server/.env` and any uncommitted edits safe.** The patch does not include an actual `.env`.
2. Copy the contents of the patch's `client/` and `server/` folders into the respective folders of your `C:\Users\youss\Projects\quantum-coffee` clone. Allow replacement of matching files.
3. Because `client/vite.config.js` proxies `/api` locally, no `client/.env` is needed for development.
4. Update `server/.env` as below. Use *both* allowed local origins:

```dotenv
NODE_ENV=development
PORT=4000
CLIENT_ORIGIN=http://127.0.0.1:5173,http://localhost:5173
MONGODB_URI=
REGISTRATION_ENABLED=false
```

5. Run in two PowerShell terminals:

```powershell
cd C:\Users\youss\Projects\quantum-coffee\server
npm.cmd install
npm.cmd test
npm.cmd run dev
```

```powershell
cd C:\Users\youss\Projects\quantum-coffee\client
npm.cmd install
npm.cmd run lint
npm.cmd run build
npm.cmd run dev
```

6. Visit `/`, `/login`, `/signup`, `/ar/login`, and `/api/health`.

## Database activation

Until `MONGODB_URI` is set and Atlas accepts the connection, `GET /api/health` shows `database: not_connected`, and `/api/auth/me` / login return `503`. This is intentional; a degraded service must not pretend to authenticate.

Create/choose a MongoDB Atlas Free cluster, database user and network access. Put the secret URI ONLY in `server/.env`, never in Git, screenshots or ChatGPT. Use a separate database, e.g. `quantumcoffee_development`, not Tap & Wrap's.

Restart server, then confirm `/api/health` shows `connected`. If needed for local smoke testing, enable `REGISTRATION_ENABLED=true`, register a test customer, verify login/logout, then revert to `false`. **Do not enable public registration on production before verification, password recovery, and anti-abuse checks are complete.**

## Admin account — local one-time action, AFTER database is connected

There is no default admin password and no public admin registration endpoint.

Set `ALLOW_ADMIN_BOOTSTRAP=true`, `ADMIN_BOOTSTRAP_EMAIL`, and `ADMIN_BOOTSTRAP_PASSWORD` in your **local** `server/.env` only, then execute `npm.cmd run admin:bootstrap` inside `server/`. The script refuses to overwrite or elevate an existing user. Immediately remove the bootstrap password and set `ALLOW_ADMIN_BOOTSTRAP=false`. Never send the password in chat or commit it.

## Security & launch limits

This is an AUTH FOUNDATION, not a production launch. In particular: email verification, password recovery, account deletion, order authorization, production logging, robust distributed rate limiting, checkout, R2 proofs, backups, and all commerce flows still require implementation and verification.

Use a custom same-site frontend and API domain for production (such as `www.example.com` and `api.example.com`) for `SameSite=Lax` session cookies. Do not deploy frontend on `pages.dev` and backend on `onrender.com` expecting cross-site cookies to work with this configuration. Production requires HTTPS.

There are no customer passwords or real environment files included in this patch.

## GitHub first commit

The GitHub repository was verified empty on 2026-10-20. Since your *current* work is in the local clone, first verify the project and then commit from there:

```powershell
cd C:\Users\youss\Projects\quantum-coffee
git status --short
git add .
git status --short
# Verify neither .env nor any secret appears staged.
git commit -m "Build Quantum Coffee branded foundation and secure auth scaffold"
git branch -M main
git push -u origin main
```

No remote changes are made by the patch itself; it does not overwrite your local work automatically.
