# Quantum Coffee Phase 4D — Order email notifications

Apply only after the Phase 4C account email patch is installed. Save a clean commit of Phase 4C first.

1. Copy the **contents of this patch** into your existing `C:\Users\youss\Projects\quantum-coffee` directory and replace matching files. This ZIP contains only changed/new files. Keep your real `server/.env` file and existing hero images.
2. From `server`: run `npm.cmd test` and `npm.cmd audit`. From `client`: run `npm.cmd run lint` and `npm.cmd run build` (the client is unchanged).
3. Keep `ORDER_EMAILS_ENABLED=false` and `CHECKOUT_ENABLED=false` until SMTP, owner recipients, shipping/payment policies, and live flows are approved and verified. No email should be sent during local tests.
4. When checks pass, inspect `git diff --check` and staged files, and commit the patch. No secrets or environment credentials belong in GitHub.
5. Read `docs/PHASE_4D_ORDER_EMAILS.md` before connecting any infrastructure.

This update does not enable checkout, registration, or actual email delivery; it only prepares the production code. It does not interact with Tap & Wrap's accounts/services.
