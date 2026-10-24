# Quantum Coffee — current product specification (Oct 24, 2026)

## Confirmed by owner

- **Three blends**: Black Hole (BH), Worm Hole (WH), Cosmic Dust (CD).
- **One physical pack size only:** 250 grams. To buy 500 g choose quantity 2; 1 kg is quantity 4. Each purchase unit is one 250 g bag.
- **One price per blend, independent of preparation choice:** Black Hole EGP 450 (45000 piastres), Worm Hole EGP 425 (42500 piastres), Cosmic Dust EGP 400 (40000 piastres). Do not create fake discounts or larger-pack variants.
- **Medium roast** for all three as currently communicated.
- **Inventory:** start with 10 bags per offered preparation for each blend. Stock is tracked by blend + preparation and summed for public catalog availability. Do not create stock in the database until the owner approves the actual list of preparation options.
- **Mahwaj / Turkish spiced:** no additional charge.
- **Supported payment methods:** COD, InstaPay, Vodafone Cash; actual receiver details pending. Leave checkout OFF.

## Offered preparations (admin-selectable presets, not all automatically enabled)

- `whole_beans`: whole beans
- `espresso`: espresso
- `moka_pot`: moka pot
- `french_press`: French press
- `filter`: filter / V60
- `turkish_plain`: Turkish plain
- `turkish_spiced`: Turkish spiced / mahwaj (same price)

Owner's messages indicate **Black Hole excludes Turkish**; Worm Hole and Cosmic Dust support Turkish and mahwaj. Do not invent additional options such as Arabic roast, aeropress, cold brew or specific espresso-machine grind levels before approval. Admin chooses permitted options per product.

## Create draft products after Atlas is connected

1. Confirm new database URI belongs to Quantum Coffee's own Atlas project; save it only to the local `server/.env`, never in Git.
2. Create a 'Coffee Blends' category (English/Arabic copy can be completed later).
3. Create the three products as **drafts** with permanent slugs, e.g. `black-hole`, `worm-hole`, `cosmic-dust`. Prices are in EGP in the admin UI; stored as piastres.
4. Enable approved grind options, with `stock=10` for each permitted option. This is per variant, NOT 10 combined.
5. Add owner-approved descriptions, Arabic names and real product images when supplied. R2 will require the owner's billing activation before uploads can work.
6. Publish only after assets, content and permitted grinds are confirmed. Checkout remains disabled.

## Await owner confirmation / inputs

- Exact permitted grind/preparation variants by blend. Current admin options are editable; no guesswork required.
- Product photos for Worm Hole and Cosmic Dust, plus additional Black Hole images; tasting notes, blend ingredients, final Arabic product names.
- Shipping fees by region, delivery policy/timeframes.
- Verified InstaPay and Vodafone Cash recipient numbers and display names; COD confirmation.
- Domain, business support WhatsApp, contact details, privacy/return/refund/shipping/terms policies.
- Use a separate Quantum Coffee Atlas database, Cloudflare R2 buckets, Render service and Cloudflare Pages project. Connected tools in this workspace currently point to Tap & Wrap, NOT Quantum Coffee. Do not modify them.

## Safety

`CHECKOUT_ENABLED=false`, `REGISTRATION_ENABLED=false`, `ORDER_EMAILS_ENABLED=false`; `ORDERING_IMPLEMENTED=false` hard-lock remains intact. No public purchase until live integration testing, payment verification, owner fees/policies and approval.
