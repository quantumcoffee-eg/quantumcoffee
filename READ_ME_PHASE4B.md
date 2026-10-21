# Phase 4B update — payment screenshot workflow

1. This is a **patch**, NOT an entire repository snapshot. Install **after** Phase 4A. Back up local edits and copy the patch's files into the existing `quantum-coffee` folder.
2. Never overwrite `server/.env`. Do not create Cloudflare/Render/Mongo resources inside Tap & Wrap's connected environment.
3. This patch does NOT enable public ordering or supply recipient phone numbers. `CHECKOUT_ENABLED=false` remains required.
4. Run `server: npm.cmd test && npm.cmd audit`, then `client: npm.cmd run lint && npm.cmd run build`.
5. Review `docs/PHASE_4B_PAYMENT_PROOFS.md` before deploying private storage.
6. Once checks pass, stage and push Phase 4A and 4B in separate commits if you want each checkpoint, or as one carefully reviewed commit. Ensure no `.env` or secrets appear in `git diff --cached --name-only`.

Known remaining prelaunch work: email verification/recovery, actual SMTP notifications, configured transfer destination and shipping policies, R2 abandoned-upload cleanup, real-order checks, payment reconciliation, production resource provisioning.
