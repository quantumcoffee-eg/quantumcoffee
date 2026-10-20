# Quantum Coffee

Phase 1 foundation for Quantum Coffee's bilingual MERN e-commerce site. JavaScript/JSX only.

## Start locally

Requires Node.js 22+ and npm.

```powershell
cd client
npm install
npm run dev
```

Open http://localhost:5173. In a second terminal:

```powershell
cd server
npm install
Copy-Item .env.example .env
npm run dev
```

API health: http://localhost:4000/api/health

## Current status

- Built: bilingual EN/AR customer-facing React foundation with LTR/RTL, marquee, responsive role-ready navigation, motion prototype hero, requested homepage sections, shop shell, about, order-tracking shell, cart, login/signup shell, legal placeholders and API health server.
- **Not built yet**: live product database, authentication, secure checkout, payments, admin CRUD, email delivery, R2, SEO prerendering, Meta Pixel, production 3D hero, real reviews and policy content. None of the placeholder pages should be mistaken for live commerce features.
- Product imagery, categories, contact details, shipping rates and legal wording await the owner's approval.

## Layout

- `client/`: React + Vite + Tailwind, GSAP-ready cinematic UI
- `server/`: Express + Mongoose-ready Node API

## Domain email architecture

- Incoming: Cloudflare Email Routing forwards branded aliases to owner Gmail.
- Outgoing: Nodemailer SMTP transport with an authenticated domain sending provider (e.g. Brevo) in production, Gmail SMTP only for local testing. `server/src/mailer.js` is **configuration only** and sends nothing until called and configured.
- Add SPF/DKIM/DMARC per the verified sending provider when domain is available.

## Deployment (later)

Cloudflare Pages frontend (build `npm run build` in `client`, output `client/dist`) + Render Starter backend (`server/`, `npm start`) + Atlas MongoDB + private R2 for payment proofs. Deploy only after auth, checkout, policy, tracking and SEO phases have been completed.
