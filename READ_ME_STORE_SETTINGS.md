# Quantum Coffee — Store Settings (owner-managed launch information)

Based on owner repository `quantumcoffee-eg/quantumcoffee`, commit `e72cba8`, with the existing catalog seed installed locally. Apply *only* the files in this patch to `C:\Users\youss\Projects\quantum-coffee`.

## What this changes

- Adds admin-only **Settings** tab (`/admin?tab=settings`) with contact details, regional delivery fees, COD/InstaPay/Vodafone Cash configuration, and bilingual shipping/refund/privacy/terms text.
- Business settings persist in the existing **Quantum Coffee production MongoDB**, in a singleton document; NO values are invented or automatically inserted by this patch.
- Public footer and legal pages read approved content. Blank policies keep the existing "information coming soon" placeholder.
- Checkout quote and server-side checkout now get shipping fees from MongoDB settings instead of shipping `.env` entries. Fees remain unavailable until the admin enters them. No automatic fallback to guessed rates.
- Public payment list only includes methods explicitly enabled by the owner; disabled receiver details are not exposed.
- Uses versioned updates (revision) so two admins cannot silently overwrite each other.
- Keeps `ORDERING_IMPLEMENTED=false` and `CHECKOUT_ENABLED=false`; **this patch cannot enable live orders**. Registration and order emails remain disabled by default.

## Security and owner-approval notes

- Only enter **public business** WhatsApp, contact email, Instagram URL and transfer-receiver details; NEVER put credentials or passwords in Settings.
- Do not enable InstaPay or Vodafone Cash until the owner confirms recipient name and actual payment account. A screenshot alone is not proof of funds; existing payment-verification workflow remains necessary.
- Do not save draft/unapproved legal policy copy in Settings; the public site displays saved policy text immediately. Store them privately elsewhere while editing, then paste only approved final text.
- The project was designed with a separate Quantum Coffee database. DO NOT change any Tap & Wrap connection or services.
- The render/Cloudflare/R2/SMTP billing and secrets are NOT managed here. Keep private environment values in `server/.env` locally (ignored by Git).
- The `SHIPPING_CAIRO_GIZA_PIASTRES` and `SHIPPING_OTHER_PIASTRES` lines in the old env example are now legacy; edit shipping through admin Settings instead.
- Only Cairo/Giza versus other-governorates delivery bands are implemented. If owner specifies different prices by governorate/area, extend the schema before launch rather than using an incorrect flat price.
- Enabling settings does not enable orders. Before launch, separately verify transaction integrity, payment instructions displayed after order creation, delivery coverage, receipt handling, full integration behavior, production domains and backups/recovery plan.

## Install + verify on Windows

```
cd C:\Users\youss\Projects\quantum-coffee\server
npm.cmd test
npm.cmd audit

cd ..\client
npm.cmd run lint
npm.cmd run build

cd ..
git status --short
git diff --check
```

Start both servers locally (same as before), sign in as Quantum Coffee admin, open **Settings**. Leave everything blank until the owner sends confirmed details. With a blank fee the checkout quote will say rates are not configured; expected.

## GitHub

Commit the three seed files from the earlier seed ZIP if still untracked, together with this patch. Review `git status` and keep actual `.env` files and unrelated `client/.env.example` edits out of the commit unless intentionally reviewed. Do not rerun the seed.

## Offline verification done when preparing this patch

- Five focused server-side settings validation tests passed.
- Changed backend `.js` files passed `node --check`.
- Changed `.jsx` files passed JavaScript/JSX syntax parsing.
- **Full project tests, React build, and database-backed admin saving were NOT run in the patch-building environment.** Run the commands above on your Windows machine and inspect the Settings tab before pushing.
