# Quantum Coffee Phase 4A — Commerce foundation
Base GitHub commit: 857a381fad36752b4376197785cec42edd8f1a54

Extract files into the existing Quantum Coffee repository and replace matching paths. Preserve server/.env, packages, logo and hero assets. Read docs/PHASE_4A_COMMERCE.md for flags and limitations.

Run `npm.cmd test` and `npm.cmd audit` in server, then `npm.cmd run lint` and `npm.cmd run build` in client. Never set CHECKOUT_ENABLED=true in this milestone.

Phase 4A has a hard code-level checkout lock and production config blocks launch. Real transfers, proof uploads, and checkout are NOT ready. All Tap & Wrap infrastructure remains untouched.
