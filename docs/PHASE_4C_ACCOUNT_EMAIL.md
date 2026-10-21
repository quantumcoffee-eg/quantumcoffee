# Quantum Coffee Phase 4C: account email verification and password recovery

Scope: transactional **account** emails only. This milestone does **not** activate checkout, prove SMTP delivery, or send order/customer/merchant notifications yet.

## Endpoints (each database-gated)
- POST `/api/auth/register` — only when `REGISTRATION_ENABLED=true` and mail configured. Creates unverified customer and emails one-use 24h verification link; no session is issued until email verification and login.
- POST `/api/auth/resend-verification` — generic response to avoid disclosing whether an unverified account exists. IP-limited.
- POST `/api/auth/verify-email` — one-use token from URL fragment, validated server-side.
- POST `/api/auth/forgot-password` — generic response, one-use 30 minute link, IP-limited.
- POST `/api/auth/reset-password` — hashes new password, invalidates other reset tokens and all sessions.
- POST `/api/auth/login` — unverified customers cannot log in. Admin bootstrap accounts remain accessible.

## Production settings
- `REGISTRATION_ENABLED=false` by default. Do not enable until real SMTP and app email delivery are tested.
- `PUBLIC_SITE_ORIGIN=https://<actual-domain>`; account links use this origin. During local tests you may use `http://127.0.0.1:5173` in `server/.env` only.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`, optional `MAIL_REPLY_TO`.
- Keep account credentials and secrets in `server/.env` or Render Environment. Never commit them.
- This patch does not change your existing `.env`. It does not contact Quantum Coffee or Tap & Wrap infrastructure.

## Known boundaries / remaining release work
- No staging database per owner. Still run basic live login/verification/reset checks before opening registration. Unit tests don't validate email delivery.
- Mail send may fail after an unverified account was stored. The customer can use the resend-verification form.
- Administrative mail delivery and order confirmation, delivery status notices, domain DKIM/SPF/DMARC, outbox retries, transactional notifications, checkout authorization, and live R2/Atlas tests are separate tasks.
- The current IP-only limiter is per Render instance and is insufficient for a scaled app; consider per-email throttling/shared store before large scale.
- Backups are not configured; production database data can be permanently lost.
