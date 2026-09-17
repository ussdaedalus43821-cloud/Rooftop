# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Rooftop is a browser-based car dealership simulation. No backend, no bundler, no framework — plain TypeScript compiled to ES modules, loaded directly by `index.html` via `<script type="module">`. State is simulated entirely client-side and autosaved to `localStorage` (with an optional real-file backup via the File System Access API in `src/fsAccess.ts`).

The design premise the whole simulation is built around: front-end vehicle gross is thin by design, and the real profit lives in the back end — F&I reserve/product attach, Service & Parts, and used-vehicle arbitrage. A player who only moves metal should lose money.

## Commands

```
npm run build            # tsc: compiles src/**/*.ts -> dist/**/*.js (plain ES modules)
npm run watch             # tsc --watch
npm run serve              # http-server on http://localhost:8080 (serves repo root; open index.html)
npm run test:e2e            # tsc -p . && playwright test  (builds first — e2e runs against dist/, not src/)
npm run test:e2e:ui          # playwright test --ui
npm run test:e2e:headed       # playwright test --headed
npm run test:e2e:debug        # playwright test --debug
```

There is no separate lint/typecheck script beyond `tsc` itself (`strict: true` in tsconfig.json). Run `npm run build` to typecheck.

To run a single e2e test, use Playwright's own filters, e.g.:
```
npx playwright test -g "loss month"
```

## Architecture

### Simulation vs. rendering split

`src/engine/**` is pure simulation logic — no DOM access. `src/ui/**` is rendering + event handling. This split exists specifically so a growing dealer group (multiple rooftops) can scale without touching the render layer. When changing gameplay behavior, look in `engine/`; when changing what's displayed or how it's clicked, look in `ui/`.

### Core files

- `src/types.ts` — every domain type (`GameState`, `Dealership`, `Vehicle`, franchise/staff/ledger shapes, etc.). Start here to understand the data model.
- `src/state.ts` — `createNewGame()` and entity constructors (staff, IDs via `nextId()`).
- `src/constants.ts` — tunable game constants and the franchise/model catalog (real makes, real MSRP/invoice figures).
- `src/persistence.ts` — `saveGame`/`loadGame` (localStorage) plus `migrateState()`, which upgrades old saves to the current shape on load. **Any new field added to `GameState`/`Dealership` needs a corresponding default in `migrateState` or existing saves will have `undefined` for it.**
- `src/rng.ts` — seeded `Rng`. All randomness in engine code goes through an `Rng` instance passed down from `main.ts`, not `Math.random()` — this is what makes e2e fixtures deterministic.
- `src/main.ts` — boot: loads/creates state, mounts UI, runs the game loop (`requestAnimationFrame`), converts elapsed real time to simulated days via `msPerGameDay(state.speed)`, calls `advanceOneDay` in a bounded loop (max 60 catch-up days per frame), autosaves every 8s when dirty, and checks for game-over (floor-plan seizure) after every advanced day.

### Engine (`src/engine/`)

One module per department/subsystem (inventory, salesFloor, fi, service, manufacturer, captiveLender, partsWarehouse, career, economy, hostileTakeover, randomEvents, staffing, insurance, expansion, financials, clock, dealClose, acquisition, manufacturerCo, manufacturerAcquisition). `engine.ts` is the orchestrator: `advanceOneDay` → `tickDealershipDay` runs each subsystem's daily tick in a deliberate order per dealership, then handles cross-dealership/monthly cycles. Read the comments in `tickDealershipDay` before reordering ticks — the order encodes real interdependencies (e.g., auto-rescue must run before curtailment/payroll accrual; allocation must run before auction so a store protects its franchise quota before buying supplemental used inventory).

**Financial invariant**: `financials.ts` is the ledger — every balance-sheet mutation (`postGrossProfit`, `postCashExpense`, `accruePayroll`, floor-plan interest, etc.) goes through one of its posting primitives so that `Assets = Liabilities + Equity` holds by construction. `checkInvariant()` computes and checks this per dealership; don't mutate `d.ledger.*` fields directly outside `financials.ts` — add a new posting primitive there instead.

### UI (`src/ui/`)

Server-side-rendering-style: each tab is a `TabModule` (`src/ui/types.ts`) with `render(ctx) -> string` (returns an HTML string), plus optional `onAction`/`onInput`/`hasAlert`. `app.ts` holds the tab list, mounts a single delegated `click`/`change` listener on the root, and dispatches based on `data-action="namespace:action"` attributes on elements (see existing tabs for the convention — e.g. `data-action="global:setTab"`, `data-action="milestone:choose"`). There's no virtual DOM or diffing — `render()` re-stringifies and replaces `innerHTML` wholesale on every state change. Always run user-facing strings through `escapeHtml` when interpolating into the HTML template strings.

To add a new tab: create `src/ui/yourTab.ts` exporting a `TabModule`, add it to the `TABS` array in `app.ts`.

### Persistence & save compatibility

Saves are versioned informally via `migrateState()` in `persistence.ts`, not a version number — it walks the loaded object and backfills any field that might be missing from an older save. Keep this in mind whenever you add a field to a long-lived state object (`Dealership`, `MonthlyFinancials`, `StaffMember`, etc.).

### Deployment

`.github/workflows/deploy-pages.yml` builds (`npm run build`), assembles `_site/` from `index.html` + `styles/` + `dist/`, runs `scripts/cachebust.mjs` to append `?v=<sha>` to JS imports and the index.html asset tags (there's no bundler to content-hash filenames, so this is the substitute against stale CDN/browser caches), then deploys to GitHub Pages on push to `main`.

## Testing

`e2e/dealership-smoke.spec.ts` drives the real compiled engine headlessly by importing straight from `dist/` (not `src/`, not mocks) — `npm run test:e2e` builds first for this reason. Tests build fixtures by calling `createNewGame()` and then hand-manipulating `GameState` (forcing an economic era, seeding staff skill, etc.) with a fixed `Rng` seed, so results are byte-for-byte reproducible — no flaky randomness-dependent assertions. When adding a scenario, follow the existing pattern: build a save via direct state manipulation + `advanceOneDay` loop rather than driving it through the UI, and give it its own fixture function rather than relying on shared `beforeEach` state.
