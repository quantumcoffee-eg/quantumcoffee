# Quantum Coffee — Safe one-time initial catalog seed

**Apply only to the owner-owned Quantum Coffee repo at `quantumcoffee-eg/quantumcoffee`, based on commit `e72cba8`.**

## What it creates
- One **hidden** category `Coffee Blends` (`coffee-blends`).
- Three **draft** products: Black Hole (250 g, EGP 450), Worm Hole (250 g, EGP 425), Cosmic Dust (250 g, EGP 400).
- Prices stored in piastres, no fake discount, no imagery, no invented tasting copy or Arabic copy.
- No grind selections and therefore 0 stock until the permitted preparations are confirmed. The admin can later set 10 units for each permitted size/preparation combination.

The script will **never update or delete existing products or categories**; it reuses matching records and creates missing ones only. Existing conflicting data causes a stop rather than overwrite.

## Install
Copy `server/src/scripts/initial-catalog-data.js`, `server/src/scripts/seed-initial-catalog.js`, and `server/test/initial-catalog-seed.test.js` into the matching paths of your local Quantum Coffee project. Keep `server/.env` private and unchanged. No package installations required.

## Step 1 — run checks and inspect read-only preview
```powershell
cd C:\Users\youss\Projects\quantum-coffee\server
npm.cmd test
node src/scripts/seed-initial-catalog.js
```
Confirm it says `Database: quantumcoffee_production`, `CREATE (hidden)` and all three draft items.

## Step 2 — explicitly authorize insertion
This operation **writes to the owner's production MongoDB**. Only do it after confirming the preview and URI belongs to Quantum Coffee.
```powershell
node src/scripts/seed-initial-catalog.js --apply --confirm=quantumcoffee_production
```
On success, refresh `http://127.0.0.1:5173/admin?tab=categories` and `?tab=products`. Run the preview again to see everything marked `KEEP EXISTING`.

## Safety
- Does not publish any products or turn on checkout/registration/emails.
- Requires `MONGODB_DB_NAME=quantumcoffee_production` in the private `server/.env` and refuses `NODE_ENV=production`.
- Does not rely on R2/Render/Cloudflare billing.
- The repository's existing `bootstrap-admin` script remains unaffected.
- Seeds only the initial catalog; after this point owner manages items in admin UI. **Do not rerun to enforce prices**; any admin price updates are preserved by design.
- The script creates MongoDB collections/unique indexes when explicitly applied, and inserts missing records in a transaction.
