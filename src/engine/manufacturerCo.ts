// ---------------------------------------------------------------------------
// Manufacturer Co. — the capstone vertical. Once the group is wealthy enough,
// the player can found their own vehicle manufacturer: a starter lineup of
// house-brand models, sold through dealerships that carry no real franchise
// at all — no tier grind, no quota, no termination risk, because you can't
// be terminated by yourself. Every unit shipped to a house-brand dealership
// earns Manufacturer Co. the spread between its transfer price and its own
// production cost, on top of that dealership's ordinary front-end/F&I/service
// gross — the same "two profit centers on one car" pattern real OEM +
// franchise-dealer economics have, which nothing in the game modeled before
// this (a real franchise's own OEM-side margin is never captured anywhere).
// ---------------------------------------------------------------------------
import type { Dealership, FranchiseCategory, FranchiseKey, GameState, ManufacturerCoState, VehicleClass, VehicleModel } from "../types.js";
import { Rng } from "../rng.js";
import { createDealership, nextId } from "../state.js";
import { postCashExpense } from "./financials.js";
import { computeGroupNetWorth } from "./career.js";

export const MANUFACTURER_CO_UNLOCK_NET_WORTH = 40_000_000;
const FOUND_COST = 2_000_000;
const NEW_STORE_COST = 300_000;
const CONVERSION_COST = 150_000;

const RND_BASE_COST = 250_000;
const RND_COST_GROWTH = 1.25;
const RND_FACTOR_STEP = 0.03;
const RND_FACTOR_FLOOR = 0.38;
const RND_STARTING_FACTOR = 0.62;

const CAPACITY_BASE_COST = 300_000;
const CAPACITY_COST_GROWTH = 1.22;
const CAPACITY_STEP_UNITS = 20;
const CAPACITY_STARTING_UNITS = 40;
const MAX_CAPACITY_UPGRADES = 30;

const MARKETING_BASE_COST = 80_000;
const MARKETING_COST_GROWTH = 1.2;
const MARKETING_REPUTATION_BUMP = 8;

// A placeholder only — never read for a house-brand dealership (every
// call site that would look at franchiseKey is guarded by isHouseBrand).
const PLACEHOLDER_FRANCHISE_KEY: FranchiseKey = "ford";

interface ClassSpec {
  cls: VehicleClass;
  names: string[];
  msrpByCategory: Record<FranchiseCategory, number>;
}

const CLASS_SPECS: ClassSpec[] = [
  {
    cls: "sedan",
    names: ["Meridian", "Voyager", "Alto", "Current"],
    msrpByCategory: { mainstream: 27_000, value: 21_000, luxury: 48_000, online: 42_000 },
  },
  {
    cls: "suv",
    names: ["Trailhead", "Summit", "Overlook", "Ranger"],
    msrpByCategory: { mainstream: 34_000, value: 26_000, luxury: 58_000, online: 50_000 },
  },
  {
    cls: "truck",
    names: ["Foreman", "Bedrock", "Haulmark", "Ridgeback"],
    msrpByCategory: { mainstream: 38_000, value: 29_000, luxury: 62_000, online: 55_000 },
  },
];

function generateStarterModels(rng: Rng, category: FranchiseCategory): VehicleModel[] {
  const usedNames = new Set<string>();
  return CLASS_SPECS.map((spec) => {
    let name = rng.pick(spec.names);
    while (usedNames.has(name) && usedNames.size < spec.names.length) name = rng.pick(spec.names);
    usedNames.add(name);
    const msrp = spec.msrpByCategory[category];
    const cls: VehicleClass = category === "online" && spec.cls === "truck" ? "ev" : spec.cls;
    return {
      name,
      trim: "Base",
      class: cls,
      msrp,
      invoice: Math.round(msrp * 0.85), // transfer price charged to house-brand dealerships
      desirability: 0.4, // an unproven new brand — climbs as reputation grows
    };
  });
}

export function newManufacturerCo(): ManufacturerCoState {
  return {
    founded: false,
    foundedDay: -1,
    brandName: "",
    category: "mainstream",
    reputation: 30,
    productionCostFactor: RND_STARTING_FACTOR,
    models: [],
    productionCapacity: 0,
    cash: 0,
    unitsShippedThisMonth: 0,
    profitThisMonth: 0,
    lastMonthUnitsShipped: 0,
    lastMonthProfit: 0,
    lifetimeUnitsShipped: 0,
    lifetimeProfit: 0,
  };
}

export function manufacturerCoFoundCost(): number {
  return FOUND_COST;
}

export function manufacturerCoUnlocked(state: GameState): boolean {
  return computeGroupNetWorth(state) >= MANUFACTURER_CO_UNLOCK_NET_WORTH;
}

export interface FoundResult {
  ok: boolean;
  reason?: string;
}

export type ManufacturerCoFunding = "active" | "treasury";

export function foundManufacturerCo(state: GameState, funding: ManufacturerCoFunding, payerDealershipId: string, brandName: string, category: FranchiseCategory, rng: Rng): FoundResult {
  if (state.career.role === "gm") return { ok: false, reason: "Become an owner before founding a manufacturer." };
  if (state.manufacturerCo.founded) return { ok: false, reason: "Already founded." };
  if (!manufacturerCoUnlocked(state)) return { ok: false, reason: `Your group needs at least $${MANUFACTURER_CO_UNLOCK_NET_WORTH.toLocaleString()} in net worth first.` };
  const name = brandName.trim();
  if (!name) return { ok: false, reason: "Give your brand a name." };

  if (funding === "treasury") {
    if (state.groupTreasury < FOUND_COST) return { ok: false, reason: "Not enough in the group treasury." };
    state.groupTreasury -= FOUND_COST;
  } else {
    const payer = state.dealerships[payerDealershipId];
    if (!payer) return { ok: false, reason: "Dealership not found." };
    if (payer.ledger.cash < FOUND_COST) return { ok: false, reason: "Not enough cash on hand." };
    postCashExpense(payer, FOUND_COST);
  }

  const mc = state.manufacturerCo;
  mc.founded = true;
  mc.foundedDay = state.day;
  mc.brandName = name;
  mc.category = category;
  mc.models = generateStarterModels(rng, category);
  mc.productionCapacity = CAPACITY_STARTING_UNITS;
  return { ok: true };
}

/** Applies the shared house-brand overrides to a dealership — no tier/quota grind, always has a new-inventory source, carries the current brand name. Used by both founding a new store and converting an existing one. */
function applyHouseBrandRelations(state: GameState, d: Dealership): void {
  d.isHouseBrand = true;
  d.brand = state.manufacturerCo.brandName;
  d.isUsedOnly = false;
  d.manufacturer.tier = "platinum"; // there's no tier to climb for your own brand — full desirability access from day one
  d.manufacturer.terminated = false;
  d.manufacturer.complianceStrikes = 0;
  d.manufacturer.monthsBelowThreshold = 0;
  d.manufacturer.quotaUnitsMonthly = 0; // no quota — you can't be terminated by yourself
  d.manufacturer.allocationCapMonthly = 0; // set by the next monthly cycle, split across every house-brand store
  d.manufacturer.allocationOrderedThisMonth = 0;
}

export interface OpenStoreResult {
  ok: boolean;
  reason?: string;
  newDealershipId?: string;
}

export function houseBrandNewStoreCost(): number {
  return NEW_STORE_COST;
}

/** Opens a brand-new dealership selling nothing but the house brand — a fresh store, same infra (staff/service/facility) any new rooftop gets. */
export function foundHouseBrandDealership(state: GameState, funding: ManufacturerCoFunding, payerDealershipId: string, rng: Rng): OpenStoreResult {
  const mc = state.manufacturerCo;
  if (!mc.founded) return { ok: false, reason: "Found your manufacturer first." };

  if (funding === "treasury") {
    if (state.groupTreasury < NEW_STORE_COST) return { ok: false, reason: "Not enough in the group treasury." };
    state.groupTreasury -= NEW_STORE_COST;
  } else {
    const payer = state.dealerships[payerDealershipId];
    if (!payer) return { ok: false, reason: "Dealership not found." };
    if (payer.ledger.cash < NEW_STORE_COST) return { ok: false, reason: "Not enough cash on hand." };
    postCashExpense(payer, NEW_STORE_COST);
  }

  const newId = nextId("dlr");
  const d = createDealership(rng, newId, `${mc.brandName} of ${rng.pick(["Meridian", "Harbor", "Union", "Crossroads", "Summit"])}`, PLACEHOLDER_FRANCHISE_KEY, state.day, NEW_STORE_COST * 0.5);
  applyHouseBrandRelations(state, d);
  state.dealerships[newId] = d;
  return { ok: true, newDealershipId: newId };
}

export function houseBrandConversionCost(): number {
  return CONVERSION_COST;
}

/** Converts an existing dealership's franchise over to the house brand — its staff, facility, service department and any inventory already on the lot all carry over untouched; only what it can newly order changes. */
export function convertToHouseBrand(state: GameState, dealershipId: string): FoundResult {
  const mc = state.manufacturerCo;
  if (!mc.founded) return { ok: false, reason: "Found your manufacturer first." };
  const d = state.dealerships[dealershipId];
  if (!d) return { ok: false, reason: "Dealership not found." };
  if (d.isHouseBrand) return { ok: false, reason: "Already selling your house brand." };
  if (d.ledger.cash < CONVERSION_COST) return { ok: false, reason: "Not enough cash on hand for the rebrand." };

  postCashExpense(d, CONVERSION_COST);
  applyHouseBrandRelations(state, d);
  return { ok: true };
}

/** The lineup as it actually sells right now — desirability climbs with brand reputation without permanently mutating the stored catalog. */
export function liveHouseBrandCatalog(mc: ManufacturerCoState): VehicleModel[] {
  const bonus = (mc.reputation / 100) * 0.4;
  return mc.models.map((m) => ({ ...m, desirability: Math.min(1, m.desirability + bonus) }));
}

/** Call after a house-brand dealership successfully orders a unit — books Manufacturer Co.'s own margin on that unit. */
export function recordHouseBrandShipment(state: GameState, model: VehicleModel): void {
  const mc = state.manufacturerCo;
  const productionCost = model.invoice * mc.productionCostFactor;
  const profit = model.invoice - productionCost;
  mc.cash += profit;
  mc.unitsShippedThisMonth += 1;
  mc.profitThisMonth += profit;
  mc.lifetimeUnitsShipped += 1;
  mc.lifetimeProfit += profit;
}

/** Run once per in-game month: rolls this month's shipment stats into "last month," lets brand reputation drift up slowly, and re-splits production capacity across however many house-brand dealerships exist. */
export function monthlyManufacturerCoCycle(state: GameState): void {
  const mc = state.manufacturerCo;
  mc.lastMonthUnitsShipped = mc.unitsShippedThisMonth;
  mc.lastMonthProfit = mc.profitThisMonth;
  mc.unitsShippedThisMonth = 0;
  mc.profitThisMonth = 0;
  if (!mc.founded) return;

  mc.reputation = Math.min(100, mc.reputation + 0.6);

  const houseBrandDealers = Object.values(state.dealerships).filter((d) => d.isHouseBrand);
  const perStoreCap = houseBrandDealers.length > 0 ? Math.floor(mc.productionCapacity / houseBrandDealers.length) : 0;
  for (const d of houseBrandDealers) {
    d.manufacturer.allocationCapMonthly = perStoreCap;
    d.manufacturer.allocationOrderedThisMonth = 0;
    d.manufacturer.quotaAttainedThisMonth = 0;
  }
}

export function sweepManufacturerCoCash(state: GameState): number {
  const amount = state.manufacturerCo.cash;
  if (amount <= 0) return 0;
  state.manufacturerCo.cash = 0;
  state.groupTreasury += amount;
  return amount;
}

// --- Investable levers -----------------------------------------------------

function rAndDUpgradeCount(mc: ManufacturerCoState): number {
  return Math.round((RND_STARTING_FACTOR - mc.productionCostFactor) / RND_FACTOR_STEP);
}

export function rAndDCost(state: GameState): number {
  return Math.round(RND_BASE_COST * Math.pow(RND_COST_GROWTH, rAndDUpgradeCount(state.manufacturerCo)));
}

export function rAndDMaxed(state: GameState): boolean {
  return state.manufacturerCo.productionCostFactor <= RND_FACTOR_FLOOR;
}

export function investInRnD(state: GameState, payerDealershipId: string): boolean {
  const mc = state.manufacturerCo;
  if (!mc.founded || rAndDMaxed(state)) return false;
  const payer = state.dealerships[payerDealershipId];
  if (!payer) return false;
  const cost = rAndDCost(state);
  if (payer.ledger.cash < cost) return false;
  postCashExpense(payer, cost);
  mc.productionCostFactor = Math.max(RND_FACTOR_FLOOR, mc.productionCostFactor - RND_FACTOR_STEP);
  return true;
}

function capacityUpgradeCount(mc: ManufacturerCoState): number {
  return Math.round((mc.productionCapacity - CAPACITY_STARTING_UNITS) / CAPACITY_STEP_UNITS);
}

export function manufacturerCapacityCost(state: GameState): number {
  return Math.round(CAPACITY_BASE_COST * Math.pow(CAPACITY_COST_GROWTH, capacityUpgradeCount(state.manufacturerCo)));
}

export function manufacturerCapacityMaxed(state: GameState): boolean {
  return capacityUpgradeCount(state.manufacturerCo) >= MAX_CAPACITY_UPGRADES;
}

export function investInManufacturerCapacity(state: GameState, payerDealershipId: string): boolean {
  const mc = state.manufacturerCo;
  if (!mc.founded || manufacturerCapacityMaxed(state)) return false;
  const payer = state.dealerships[payerDealershipId];
  if (!payer) return false;
  const cost = manufacturerCapacityCost(state);
  if (payer.ledger.cash < cost) return false;
  postCashExpense(payer, cost);
  mc.productionCapacity += CAPACITY_STEP_UNITS;
  return true;
}

export function marketingCost(state: GameState): number {
  // Reputation itself caps the payoff (desirability bonus maxes out at 100 reputation), so no hard investment ceiling is needed beyond that.
  const investmentsSoFar = Math.round((state.manufacturerCo.reputation - 30) / MARKETING_REPUTATION_BUMP);
  return Math.round(MARKETING_BASE_COST * Math.pow(MARKETING_COST_GROWTH, Math.max(0, investmentsSoFar)));
}

export function investInMarketing(state: GameState, payerDealershipId: string): boolean {
  const mc = state.manufacturerCo;
  if (!mc.founded || mc.reputation >= 100) return false;
  const payer = state.dealerships[payerDealershipId];
  if (!payer) return false;
  const cost = marketingCost(state);
  if (payer.ledger.cash < cost) return false;
  postCashExpense(payer, cost);
  mc.reputation = Math.min(100, mc.reputation + MARKETING_REPUTATION_BUMP);
  return true;
}
