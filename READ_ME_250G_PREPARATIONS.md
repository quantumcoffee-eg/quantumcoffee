# Quantum Coffee — 250 g and Grind/Preparation Variants

Base GitHub: `https://github.com/quantumcoffee-eg/quantumcoffee` at `ffc33be` (Add queued order email notifications).

## Installation

1. Make sure the local Git remote points to `quantumcoffee-eg/quantumcoffee`.
2. Save/review any uncommitted work first. The existing `client/.env.example` local edit is **not included** in this ZIP.
3. Extract the ZIP **into the existing project root**, preserving paths and replacing the matching source files. Do not delete other project files.
4. Run the following checks on your own machine:

```
cd C:\Users\youss\Projects\quantum-coffee\server
npm.cmd test
npm.cmd audit
cd ..\client
npm.cmd run lint
npm.cmd run build
```

5. Review `git diff`, especially around source files. Commit only after the checks pass.

## Included

- Exactly one pack size: 250 g; quantity 2 = 500 g (2 bags), quantity 4 = 1 kg (4 bags).
- Admin can enable permitted grind/preparation options for each blend. Newly enabled options default to **10 bags of that preparation**. Price is identical for all options, including Turkish spiced (mah-waj).
- Backend validates variants, calculates total inventory, reserves inventory per selected preparation, restores it on cancellation, and preserves choices in order lines.
- Product page, cart, checkout quote, customer order views, and admin orders show selected preparation; cart uses a new storage key to avoid silently guessing an old item's grind.
- New offline unit tests. No production DB writes, credentials, real images or deployed services.
- `docs/QUANTUM_COFFEE_PRODUCT_SETUP.md` contains confirmed products/prices, owner-pending details and exact data-entry instructions.

## Caution

The preset choices are **configurable, not all automatically enabled**. Owner's stated compatibility: Black Hole excludes Turkish; Worm Hole and Cosmic Dust allow Turkish and spiced. Confirm the final variants before saving a real product.

Keep `CHECKOUT_ENABLED=false`, `REGISTRATION_ENABLED=false`, `ORDER_EMAILS_ENABLED=false` and leave the code-level checkout lock unchanged until the independent production launch checks. The current connected Render/MongoDB/Cloudflare tools are Tap & Wrap accounts and must remain untouched.

The 250g stock migration isn't automatic. Any catalog documents created with the older schema require manual review, and past carts stored in v1 are not migrated to avoid assigning unintended grinds.
