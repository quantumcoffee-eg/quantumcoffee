# Quantum Coffee — Delivery Roadmap

## Phase 1 — Bilingual visual foundation (starter)

- [x] JavaScript-only `client/` and `server/` folders
- [x] Brand assets and color tokens matching owner palette
- [x] Continuous announcement marquee
- [x] Desktop/mobile navigation shell with guest role and intended role-to-link mapping
- [x] EN/AR URL structure and RTL direction
- [x] Homepage sections: cinematic motion concept, categories, featured, why, reviews, FAQ, footer
- [x] Shop shell with responsive search/filter/sort layout
- [x] About, cart, guest tracking, customer account, login and legal placeholder pages
- [x] Express API health endpoint and configurable Nodemailer transport (not enabled)

## Phase 2 — Authentication and permissions

- [ ] MongoDB connection and Mongoose models
- [ ] Secure password hashing, session cookies, CSRF protection, throttling and password recovery
- [ ] Distinct guest/customer/admin states; guard customer and admin routes server-side
- [ ] Navbar: guest Track Order, customer My Orders, admin Track Order. Account icon directs by role.

## Phase 3 — Catalog and admin

- [ ] Product and category CRUD, private/signed R2 image uploads, validation and revision control
- [ ] Compare-at price (strictly above actual price), stock management and product image gallery
- [ ] Arabic and English product/category content and URL policy
- [ ] Public product cards, search, sorting, responsive filtering, pagination and product detail page
- [ ] Owner-selected bestsellers and category imagery

## Phase 4 — Orders, commerce and notification

- [ ] Cart and checkout with server-calculated totals, shipping and inventory reservations
- [ ] COD, InstaPay and Vodafone Cash; upload proof against order number; no public proof URLs
- [ ] Admin fulfillment/payment state changes and audit history; idempotency on order submission
- [ ] Guest tracking with rate limits, customer order history, optional account linking
- [ ] SMTP sender domain verification, SPF/DKIM/DMARC, transaction email templates and retry queue

## Phase 5 — Quality and launch

- [ ] Production-quality pre-rendered hero and mobile adaptation, performance and reduced-motion validation
- [ ] Consent-based Meta Pixel and server Conversions API with event deduplication
- [ ] Crawlable prerendered metadata, canonical URLs, hreflang, Product/Offer schema, sitemap, robots.txt
- [ ] Real reviews/FAQ/policies/contact details; accessibility, browser/end-to-end and security tests
- [ ] Deploy Cloudflare Pages, Render Starter, Atlas free cluster and R2; setup backups and alerts

**Launch rule:** All placeholder and in-progress pages are currently marked `noindex,nofollow`. Remove this only when real content, safe commerce flows and SEO are ready.
