# Quantum Coffee — Phase 3B update

Source baseline: `youssefkhaled222/quantum-coffee` main commit `7c66ef4dd7770be256e7073b1e12a16ef43a1667` (Phase 3A).

## Install

1. Confirm your latest local project has Phase 3A and no unsaved local changes you want to keep. Make a temporary copy if you have edited any of these files.
2. Extract the ZIP into `C:\Users\youss\Projects\quantum-coffee`, keeping the `client/`, `server/`, and `docs/` folders in place, and replace matching files.
3. **Do not replace** `server/.env` or any secrets. The ZIP only updates `.env.example`.
4. Run:

```powershell
cd C:\Users\youss\Projects\quantum-coffee\server
npm.cmd install
npm.cmd test
npm.cmd audit

cd ..\client
npm.cmd run lint
npm.cmd run build
```

5. With no Quantum Coffee MongoDB/R2 configured yet, the UI will show meaningful empty states and image uploads will say storage is unavailable; this is expected. No fake products are inserted.
6. When the build succeeds, inspect `git status --short`, confirm `.env` isn't staged, commit `server/package-lock.json` along with the patch, and push `main`.

New R2 setup will be completed **later**, using only dedicated Quantum Coffee resources. Detailed instructions: `docs/PHASE_3B_MEDIA_SHOP.md`.

IMPORTANT: Orders, checkout, cart purchasing, and payment proof uploads are NOT functional. This is **not** a production-ready commerce launch. Product publication can be enabled by an admin once R2 is connected; that only enables catalog browsing, not purchasing.
