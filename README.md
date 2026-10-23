# Rooftop

A realistic car dealership simulation, playable entirely in the browser.

You start as a salaried **General Manager** hired to run one rooftop — no
equity, evaluated purely on performance. The core lesson the game is built
around: a dealership barely makes money on the vehicle sale itself. Front-end
gross is thin. The real profit lives in the back end — F&I financing reserve
and product attach, the Service & Parts department, and used-vehicle
arbitrage on trade-ins. A player who only thinks about moving metal off the
lot should lose money; a player who understands the whole store shouldn't.

Every brand, model, invoice, and MSRP in the franchise catalog is real. A new
game asks what customer base you want to serve (Mainstream, Value / Budget,
Luxury, or Online-Only / Direct-to-Consumer) and which brand to carry.

## Running it

No build tooling or package registry access is required beyond a global
TypeScript compiler and a static file server:

```
npm run build   # compiles src/**/*.ts -> dist/**/*.js (plain ES modules)
npm run serve   # serves the repo root on http://localhost:8080
```

Then open `http://localhost:8080/index.html`. There is no backend — all
state is simulated client-side and autosaved to `localStorage`. The Settings
tab can also download a save backup as JSON, load one back in, or (in
browsers with the File System Access API) keep a real save file on disk in
sync.

End-to-end tests drive the compiled engine headlessly with Playwright:

```
npm run test:e2e   # builds first, then runs e2e/ against dist/
```

## What's simulated

- **Inventory & floor-plan financing** — manufacturer allocation (tiered,
  gated by sales/CSI performance), wholesale auctions, trade-in appraisal, a
  recon pipeline (acquired → inspected → reconditioning → ready → listed),
  daily floor-plan interest accrual, curtailment at aging thresholds, and a
  genuine sold-out-of-trust / floor-plan-audit failure path.
- **Sales floor** — showroom traffic ("ups"), salesperson closing skill, and
  a four-square Deal Sheet (price / trade / down payment / monthly payment)
  as the actual negotiation interaction.
- **F&I** — financing reserve markup over the bank's buy rate, a product
  menu (warranty, GAP, prepaid maintenance, aftermarket) with skill-driven
  attach chances, and F&I gross per vehicle retailed tracked as its own line.
- **Service & Parts** — bays and technicians competing for capacity between
  customer-pay work, warranty work (reimbursed below retail rate), and
  reconditioning; parts stocking vs. special-order trade-offs; service
  retention feeding back into future sales.
- **Manufacturer relations** — sales quota attainment, CSI, facility
  standards, and franchise standing, with allocation tier moving up or down
  based on sustained performance, up to chronic-failure franchise
  termination (the store keeps running used-only, not a hard game over).
- **Staffing** — hire, train, give raises to, and fire sales staff and
  service technicians; payroll is one of the few genuinely fixed costs, and
  monthly incentives and aged-unit bonuses pay out on top of commission.
- **Economy** — the market always sits in a named era (expansion, late-cycle
  credit boom, credit crisis, recession, recovery, supply shock, rate shock)
  calibrated against real U.S. auto-industry and macro data, with each era's
  successor shaped by how real business cycles sequence rather than a flat
  coin flip.
- **Random events & insurance** — test-drive wrecks, hail, theft,
  service-bay mishaps, customer return requests, manufacturer recalls, and
  compliance fines, some with follow-up ripples on a later day. A per-store
  garage policy (tier + deductible, real monthly premium) recovers most
  physical and liability losses, and the floor-plan lender expects its
  collateral to stay insured.
- **Financials** — a real balance sheet (Assets = Liabilities + Equity)
  enforced by construction through a small set of bookkeeping primitives,
  with the invariant checked and displayed every tick.
- **Career arc** — sustained strong performance accrues a bonus/profit-share
  pool and eventually offers a real choice: buy an equity stake in the
  current store, or take ownership of a new rooftop and start a small dealer
  group with a rolled-up group view.
- **Dealer group** — build new rooftops, buy out competitor dealerships, sell
  stores, and move cash between stores and a group treasury. Rivals push
  back with hostile takeovers: a neglected store draws a bid on your weakest
  rooftop, and a wealthy group draws one on its flagship, with a window to
  pay to defend it or lose it to a below-value forced sale.
- **Group businesses** — charter a Captive Lender that books the financing
  on every deal in the group instead of leaving that interest to an outside
  bank, and a Parts Warehouse that restocks every store at wholesale and
  sells spare capacity to outside shops.
- **Manufacturer Co.** — the capstone: found your own vehicle manufacturer
  with a house-brand lineup sold through stores that carry no outside
  franchise (no tier grind, no quota, no termination), earning the OEM-side
  margin on every unit on top of each store's own gross. At the very top
  end you can buy out an entire real automaker and either merge it into
  your house brand or keep it as its own brand, with every store you run
  under it becoming factory-owned.
- **Game over** — a floor-plan seizure (failed audit / sold out of trust)
  ends the game only when it hits your sole store; in a group, the seized
  store closes and drops out while the rest keep running. Everything else,
  including losing a franchise, is survivable.

## Project layout

```
src/
  types.ts, constants.ts, state.ts, persistence.ts, rng.ts
  engine/        pure simulation logic (no DOM), one module per department
  ui/            rendering + event handling, one module per tab
  main.ts        boot, game loop, autosave
  fsAccess.ts    optional on-disk save file (File System Access API)
styles/main.css
index.html
e2e/             Playwright scenarios against the compiled dist/
scripts/         cachebust.mjs for the GitHub Pages deploy
```

Simulation and rendering are kept separate so a growing dealer group (more
rooftops) scales without touching the render layer.

## Releasing

Pushes to `main` deploy to GitHub Pages via
`.github/workflows/deploy-pages.yml`.

For an itch.io (or any static-host) HTML upload, the playable build is just
`index.html`, `styles/`, and `dist/`:

```
npm run build
mkdir -p release && cp -r index.html styles dist release/
find release/dist -name '*.js.map' -delete
find release/dist -name '*.js' -exec sed -i '/^\/\/# sourceMappingURL=/d' {} +
(cd release && zip -r -X ../rooftop-v1.0.0.zip . -x '.*')
```

`index.html` must sit at the root of the zip. Source maps are stripped
because they point at `src/`, which isn't shipped. No cache-busting is
needed, because itch.io serves every upload from a fresh URL.
