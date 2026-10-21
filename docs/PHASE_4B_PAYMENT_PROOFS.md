# Quantum Coffee — Phase 4B: private payment screenshots and manual review

## Purpose and limitations

This milestone **does not launch checkout**. `ORDERING_IMPLEMENTED=false`, `CHECKOUT_ENABLED=false` and the production guard stay in place. Customer emails and mobile money destination details are **not provided**, so no actual transfers should be requested yet. Existing Tap & Wrap resources must NEVER be used for Quantum Coffee.

Adds proof submission for **existing** digital-payment orders, protected by ownership (customer account) or order number + checkout phone (guest). Only `instapay` and `vodafone_cash` can upload, when payment is `awaiting_transfer` or `rejected`. A proof enters `awaiting_verification`; an authenticated admin must check the actual bank/wallet receipt **outside the screenshot** before approving. A rejected proof may be resubmitted, subject to a per-order limit. COD can be marked collected only after delivery.

## Storage architecture

- Quantum-specific R2 account credentials and an R2 **private** bucket, **different from** `R2_PUBLIC_BUCKET`.
- Private bucket must not have any public custom domain or public `r2.dev` access. Configure CORS for **only the future site origin(s)**, permitting `PUT` and `Content-Type` header. The browser uses signed PUT URLs valid for 90s.
- Uploads are limited to JPEG/PNG/WebP and 5 MiB. After upload, Render reads only the first 32 bytes and object metadata. It then copies the screenshot to a **private, immutable review key** and checks the copied content again.
- The admin receives a 60-second signed GET link, generated only after admin session verification. Never store signed URLs in MongoDB or analytics.
- The API keeps `PaymentProof` records and payment history. An automated cleanup job to remove abandoned / unreferenced R2 objects is **not yet implemented**, so do not run large-scale proof uploads until cleanup is added.
- A screenshot is **not proof that a transfer settled**. Approving requires checking the payment provider outside the site.

## API summary

- `POST /api/commerce/payment-proofs/intent` `{orderNumber, phone?, contentType, size}`; customer owner may omit phone.
- Browser `PUT` file to provided signed URL using returned headers, without cookies.
- `POST /api/commerce/payment-proofs/:proofId/confirm` `{orderNumber, phone?}`; returns updated order payment state.
- `GET /api/admin/payments/:orderId/proof`; authenticated admin only; signed private view link.
- `PATCH /api/admin/payments/:orderId/review` `{revision, decision: 'approve'|'reject', reason?}`; rejecting requires a reason, visible to customer on tracking and My Orders.

## Production setup (later)

- Connect separate Quantum Coffee Atlas project + M0 database, new R2 public/private buckets, Cloudflare Pages project, Render Starter service, and purchased domain.
- Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_BUCKET, R2_PRIVATE_BUCKET, R2_PUBLIC_BASE_URL securely on the Quantum Coffee service.
- R2 access token permissions must be limited to the **Quantum Coffee** buckets; do not reuse Tap & Wrap credentials.
- Create the store's confirmed InstaPay handle / Vodafone Cash number and customer-facing payment instructions; do not invent payment recipient information.
- Verify CORS, private bucket privacy, image PUT/confirm/read, duplicate retry, admin approval/rejection and COD collection against the **dedicated production database**, with ordering still disabled for public visitors.
- Before switching orders on, complete email verification/recovery, shipping terms, email notifications, integration testing, abandoned-upload cleanup, backup/recovery strategy and owner authorization.

## Checks

From server: `npm.cmd test`, `npm.cmd audit`.
From client: `npm.cmd run lint`, `npm.cmd run build`.

The checked-in unit tests **do not substitute for** live Cloudflare R2/MongoDB transactions; those require the owner's future Quantum Coffee credentials.
