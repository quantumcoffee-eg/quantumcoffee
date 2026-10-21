# Quantum Coffee — Phase 4D: transactional order notifications

This patch applies **after Phase 4C**. Nothing has been deployed or sent.

## Events and delivery

- New order: notify customer if they entered an email; notify shop owner if `ORDER_ALERT_EMAIL` is configured.
- Payment proof submitted: notify customer and owner.
- Payment approved/rejected or COD collected: notify customer.
- Order fulfillment changed: notify customer.
- All templates include English + Arabic, order reference, state and total; no card data, receipt screenshots, account reset tokens, delivery address or phone number.
- Customer emails point to `/track-order`; admin emails point to `/admin`. They do **not** automatically verify funds, nor send unapproved transfer instructions.
- Notifications are disabled by default even if account-verification SMTP is configured.

The durable notification queue is stored in a new `ordermails` MongoDB collection (no additional cloud service). A background worker polls at most **once every two minutes** while enabled and processes up to **5 messages** each pass. It leases each item for one minute and retries failures with exponential delay, at most five attempts. Successfully sent metadata automatically expires after 90 days. It never includes SMTP secrets.

**Limitations:** this is *at-least-once*, not exactly-once delivery: in a crash after SMTP accepts an email but before MongoDB acknowledges its sent state, an email can be retried. Queue insertion follows the order transaction to avoid failing an already committed order; if the database fails precisely when queuing, that notification may be missing and will be logged (recovered checkout retries requeue the placement message). Review that tradeoff and complete live integration checks before production activation. Email sends must not be interpreted as a payment receipt. Multi-instance deployment is not in scope; run a single Render Starter service as planned. There is not yet an admin queue monitoring screen or manual replay.

## Configure only after Quantum SMTP is tested

In Render environment variables for Quantum Coffee's new service, not `.env.example` and never GitHub:

```dotenv
ORDER_EMAILS_ENABLED=false
ORDER_ALERT_EMAIL=owner@quantumcoffee.example
```

When mail delivery has been independently verified and the owner agrees on recipients, configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`, `MAIL_REPLY_TO`, and `PUBLIC_SITE_ORIGIN`, then set `ORDER_EMAILS_ENABLED=true`. The production guard rejects enabling notifications without required SMTP values and a valid HTTPS site origin. `ORDER_ALERT_EMAIL` is optional; unset it to suppress owner alerts.

The SMTP sender identity must be permitted by the actual provider. Cloudflare Email Routing only handles inbound forwarding; it is **not** the outbound SMTP provider.

## Before launch

- Verify with **Quantum Coffee's own** MongoDB, outbound SMTP and R2 resources, never Tap & Wrap's.
- Verify order-created, proof-submitted, approval/rejection and fulfillment emails reach both intended mailboxes, including spam checks.
- Confirm error behavior: Mongo connection interruption; SMTP unreachable; retry, lease recovery, no PII leakage and duplicate email caveat.
- Supply owner-approved shipping rates, payment destination instructions, policies, and real product photos.
- `CHECKOUT_ENABLED=false` and the code-level `ORDERING_IMPLEMENTED=false` remain enforced. Do not bypass either without a separate documented launch authorization and full integration verification.
- No staging cluster required for the code patch; never test destructive changes against production records. Atlas free-tier without backups increases the need for careful migration review.
