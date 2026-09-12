# Rooftop

A realistic car dealership simulation, playable entirely in the browser.

You start as a salaried **General Manager** hired to run one rooftop — no
equity, evaluated purely on performance. The core lesson the game is built
around: a dealership barely makes money on the vehicle sale itself. Front-end
gross is thin. The real profit lives in the back end — F&I financing reserve
and product attach, the Service & Parts department, and used-vehicle
arbitrage on trade-ins. A player who only thinks about moving metal off the
lot should lose money; a player who understands the whole store shouldn't.

## Running it

No build tooling or package registry access is required beyond a global
TypeScript compiler and a static file server:

```
npm run build   # compiles src/**/*.ts -> dist/**/*.js (plain ES modules)
npm run serve   # serves the repo root on http://localhost:8080
```

Then open `http://localhost:8080/index.html`. There is no backend — all
state is simulated client-side and autosaved to `localStorage`.

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
- **Financials** — a real balance sheet (Assets = Liabilities + Equity)
  enforced by construction through a small set of bookkeeping primitives,
  with the invariant checked and displayed every tick.
- **Career arc** — sustained strong performance accrues a bonus/profit-share
  pool and eventually offers a real choice: buy an equity stake in the
  current store, or take ownership of a new rooftop and start a small dealer
  group with a rolled-up group view.

## Project layout

```
src/
  types.ts, constants.ts, state.ts, persistence.ts, rng.ts
  engine/        pure simulation logic (no DOM), one module per department
  ui/            rendering + event handling, one module per tab
  main.ts        boot, game loop, autosave
styles/main.css
index.html
```

Simulation and rendering are kept separate so a growing dealer group (more
rooftops) scales without touching the render layer.
