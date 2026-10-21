# Phase 4A — Commerce foundation (not a launch)

Based on Quantum Coffee GitHub commit `857a381fad36752b4376197785cec42edd8f1a54` (Phase 3B).

## Implemented

- Cart persisted in browser storage, storing only MongoDB product IDs and quantity, not prices.
- Product detail page Add to Cart and header count; cart item hydration from the API.
- Checkout form supporting customer information, governorate and method selection for COD, InstaPay, Vodafone Cash.
- Server-calculated order quotes; category and product publication checks; quantity/stock validation.
- MongoDB Order model, immutable product/price snapshots, idempotent `checkoutKey`, server-owned order reference, and transactionally decremented stock. Source implemented but kept behind a hard `ORDERING_IMPLEMENTED=false` launch lock.
- Guest tracking by order number + checkout phone, customer order history, admin orders list/details/valid status transitions and stock-restoring cancellation.
- Simple English/Arabic presentation for primary commerce screens; translation polish is part of final UI review.

## Crucial limitation

**This version does not accept actual orders.** The hard launch lock is deliberate. It remains disabled even if `CHECKOUT_ENABLED=true`. Do not remove the lock until Phase 4B adds and verifies private payment screenshots, transfer instructions, admin payment verification, owner-approved shipping/payment rules and a database-backed checkout test.

In production, config validation rejects CHECKOUT_ENABLED=true until the remaining milestones are implemented.

The admin Orders tab will be empty until real orders are enabled. The live Atlas/R2 services for Quantum Coffee are not set up, so no end-to-end database or upload testing has occurred.

## Configuration pending owner signoff

`SHIPPING_CAIRO_GIZA_PIASTRES`, `SHIPPING_OTHER_PIASTRES`: integers in Egyptian piastres. Example: 90 EGP = `9000` (only an illustrative calculation, not an approved shipping fee). **Do not set fees until the owner confirms them.**

`CHECKOUT_ENABLED=false` — keep disabled. The code enforces a second immutable lock in this phase.

## Later Phase 4B

- Dedicated private R2 bucket for transfer proof, presigned upload, confirm-by-signature/size, admin-only reading on demand.
- Accurate COD/InstaPay/Vodafone Cash payment instructions and admin payment verification/rejection.
- Owner-confirmed shipping fees, legal text, phone/contact and payment account details.
- Transactional order placement/stock decrement/idempotent retry against Quantum's real Atlas database in a controlled test, not Tap & Wrap's resources.
- Email receipts and admin alerts (SMTP to be configured after domain purchase).
- Checkout launch readiness review and explicit owner authorization.

## Local verification

Run from server: `npm.cmd install`, `npm.cmd test`, `npm.cmd audit`; from client: `npm.cmd run lint`, `npm.cmd run build`.
No staging database required. We should still test checkout and storage once using the dedicated production infrastructure **before** accepting real customer orders.

### Production risk accepted

The owner has not requested database backups. This increases exposure to permanent order and customer-data loss. Backups are strongly recommended before launch; none are silently provisioned in this patch.
