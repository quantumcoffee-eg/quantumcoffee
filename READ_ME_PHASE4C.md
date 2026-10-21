# Apply Phase 4C on top of Phase 4B

1. First finish and push Phase 4A/4B from your machine. We did not change GitHub main.
2. Extract only this patch onto the current Quantum Coffee project. Your `server/.env` and hero images are untouched.
3. Run `npm.cmd test` / `npm.cmd audit` inside `server`, and `npm.cmd run lint` / `npm.cmd run build` inside `client`.
4. Registration stays disabled. Don't put live SMTP passwords into version control.
5. Once tests pass, commit the Phase 4C changes. Read `docs/PHASE_4C_ACCOUNT_EMAIL.md` for production wiring and limitations.
