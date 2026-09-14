// ---------------------------------------------------------------------------
// Acquire a Manufacturer — buying out an entire real automaker's operation,
// not just one of its dealerships (see engine/expansion.ts's
// buyCompetitorDealership for that). This is the single most expensive
// thing in the game, full stop — priced above even Manufacturer Co.'s own
// ultra-limited hypercar ($1.5T), because buying out a real OEM's entire
// manufacturing operation is a bigger undertaking than launching one halo
// car for your own from-scratch brand ever was. Two outcomes on purchase:
//   - Merge it into your own house brand (state.manufacturerCo): folds a
//     couple of its real models into your lineup and converts every
//     dealership you already run under that franchise into a house-brand
//     store, same mechanics as convertToHouseBrand.
//   - Keep it running as its own distinct brand: every dealership you run
//     under that franchise becomes factory-owned — no termination risk, no
//     compliance grind, a permanent allocation boost — and every unit it
//     ships earns you the manufacturer's own margin on top of that store's
//     ordinary retail gross, the same "two profit centers on one car"
//     pattern Manufacturer Co. already models for a from-scratch brand.
// Only one manufacturer can be under acquisition at a time — a second real
// automaker buyout is a future goal, not a day-one one.
// ---------------------------------------------------------------------------
import type { AcquiredManufacturerState, Dealership, FranchiseCategory, FranchiseKey, GameState, VehicleModel } from "../types.js";
import { FRANCHISE_CATALOGS, FRANCHISE_OPTIONS, getFranchiseOption } from "../constants.js";
import { Rng } from "../rng.js";
import { postCashExpense } from "./financials.js";
import { computeGroupNetWorth } from "./career.js";
import { monthIndex } from "./clock.js";
import { applyHouseBrandRelations, MAX_MANUFACTURER_MODELS, rebrandDealershipName, redistributeManufacturerCapacity } from "./manufacturerCo.js";

// A teaser point, not an affordability point — same ratio to cost that
// Manufacturer Co.'s own $40M unlock line carries against its $150M-$400M
// founding cost: visible well before you can actually swing it, so it's a
// real target to grow toward rather than a surprise that appears already
// affordable.
export const MANUFACTURER_ACQUISITION_UNLOCK_NET_WORTH = 300_000_000_000;

// Every tier here is priced above Manufacturer Co.'s own $1.5T hypercar —
// this is meant to read as "you could launch a dozen hypercars for what
// this costs." Still scaled by brand category the same way every other
// Manufacturer Co. cost is, so a value-brand buyout is relatively (not
// absolutely) more reachable than a luxury one.
const ACQUIRE_COST_BY_CATEGORY: Record<FranchiseCategory, number> = {
  value: 2_000_000_000_000,
  mainstream: 3_500_000_000_000,
  online: 5_000_000_000_000,
  luxury: 8_000_000_000_000,
};

// The margin an acquired brand's own plant runs at when kept independent —
// generous (a real OEM's own manufacturing margin), but still bounded by
// what that franchise's own model invoices are actually worth, not free money.
const ACQUIRED_BRAND_PRODUCTION_COST_FACTOR = 0.65;

// How many of the acquired brand's own real models get folded into your
// lineup on a merge, and how much plant capacity comes along with it.
const MERGE_MODELS_ADDED = 2;
const MERGE_CAPACITY_BONUS = 80;

const TARGETS_PER_MONTH = 2;

export function manufacturerAcquisitionUnlocked(state: GameState): boolean {
  return computeGroupNetWorth(state) >= MANUFACTURER_ACQUISITION_UNLOCK_NET_WORTH;
}

export function acquireManufacturerCost(category: FranchiseCategory): number {
  return ACQUIRE_COST_BY_CATEGORY[category];
}

function eligibleFranchises(state: GameState): FranchiseKey[] {
  const owned = state.acquiredManufacturer?.owned ? state.acquiredManufacturer.franchiseKey : null;
  // Carvana-style brands (baseQuota 0) have no manufacturing of their own to buy.
  return FRANCHISE_OPTIONS.filter((f) => f.baseQuota > 0 && f.key !== owned).map((f) => f.key);
}

/** Rotating list of real brands available to buy outright, refreshed monthly like the competitor-dealership targets. */
export function manufacturerAcquisitionTargets(state: GameState, rng: Rng): FranchiseKey[] {
  const idx = monthIndex(state.day);
  const pool = eligibleFranchises(state);
  const stale = state.manufacturerAcquisitionTargetsMonth !== idx || state.manufacturerAcquisitionTargets.some((k) => !pool.includes(k));
  if (stale) {
    const available = [...pool];
    const picks: FranchiseKey[] = [];
    for (let i = 0; i < Math.min(TARGETS_PER_MONTH, available.length); i++) {
      const pick = rng.pick(available);
      picks.push(pick);
      available.splice(available.indexOf(pick), 1);
    }
    state.manufacturerAcquisitionTargets = picks;
    state.manufacturerAcquisitionTargetsMonth = idx;
  }
  return state.manufacturerAcquisitionTargets;
}

/** Owning your own plant means permanent supply priority and zero termination risk — a real, lasting boost over whatever this store's franchise standing already was, not a full house-brand-style blank check (real quotas and a bounded allocation bump still apply). */
export function applyFactoryOwnership(d: Dealership): void {
  d.factoryOwned = true;
  d.manufacturer.tier = "platinum";
  d.manufacturer.terminated = false;
  d.manufacturer.complianceStrikes = 0;
  d.manufacturer.monthsBelowThreshold = 0;
  d.isUsedOnly = false;
  d.manufacturer.allocationCapMonthly = Math.round(d.manufacturer.allocationCapMonthly * 1.5);
  d.manufacturer.quotaUnitsMonthly = Math.round(d.manufacturer.quotaUnitsMonthly * 1.5);
}

function mergeFranchiseIntoOwnBrand(state: GameState, franchiseKey: FranchiseKey): void {
  const mc = state.manufacturerCo;
  const catalog = FRANCHISE_CATALOGS[franchiseKey];
  const topSeeds = [...catalog].sort((a, b) => b.desirability - a.desirability).slice(0, MERGE_MODELS_ADDED);
  for (const seed of topSeeds) {
    if (mc.models.length >= MAX_MANUFACTURER_MODELS) break;
    mc.models.push({
      name: seed.name,
      trim: seed.trim,
      class: seed.class,
      msrp: seed.msrp,
      invoice: Math.round(seed.msrp * seed.invoiceFrac),
      desirability: seed.desirability,
    });
  }
  mc.productionCapacity += MERGE_CAPACITY_BONUS;

  for (const d of Object.values(state.dealerships)) {
    if (d.manufacturer.franchiseKey !== franchiseKey || d.isHouseBrand) continue;
    d.name = rebrandDealershipName(d.name, d.brand, mc.brandName);
    applyHouseBrandRelations(state, d);
  }
  redistributeManufacturerCapacity(state);
}

export interface AcquireManufacturerResult {
  ok: boolean;
  reason?: string;
}

export type ManufacturerAcquisitionFunding = "active" | "treasury";

export function acquireManufacturer(
  state: GameState,
  funding: ManufacturerAcquisitionFunding,
  payerDealershipId: string,
  franchiseKey: FranchiseKey,
  mergeIntoOwnBrand: boolean,
  rng: Rng,
): AcquireManufacturerResult {
  if (state.career.role === "gm") return { ok: false, reason: "Become an owner before acquiring a manufacturer." };
  if (state.acquiredManufacturer?.owned) return { ok: false, reason: "You already own an acquired manufacturer." };
  if (!manufacturerAcquisitionUnlocked(state)) {
    return { ok: false, reason: `Your group needs at least $${MANUFACTURER_ACQUISITION_UNLOCK_NET_WORTH.toLocaleString()} in net worth first.` };
  }
  const targets = manufacturerAcquisitionTargets(state, rng);
  if (!targets.includes(franchiseKey)) return { ok: false, reason: "That manufacturer isn't currently for sale." };
  if (mergeIntoOwnBrand && !state.manufacturerCo.founded) {
    return { ok: false, reason: "Found your own manufacturer first if you want to fold this brand into it." };
  }

  const option = getFranchiseOption(franchiseKey);
  const cost = acquireManufacturerCost(option.category);

  if (funding === "treasury") {
    if (state.groupTreasury < cost) return { ok: false, reason: "Not enough in the group treasury." };
    state.groupTreasury -= cost;
  } else {
    const payer = state.dealerships[payerDealershipId];
    if (!payer) return { ok: false, reason: "Dealership not found." };
    if (payer.ledger.cash < cost) return { ok: false, reason: "Not enough cash on hand." };
    postCashExpense(payer, cost);
  }

  if (mergeIntoOwnBrand) {
    mergeFranchiseIntoOwnBrand(state, franchiseKey);
  } else {
    for (const d of Object.values(state.dealerships)) {
      if (d.manufacturer.franchiseKey === franchiseKey) applyFactoryOwnership(d);
    }
  }

  const acquired: AcquiredManufacturerState = {
    owned: true,
    brand: option.brand,
    franchiseKey,
    acquiredDay: state.day,
    acquiredCost: cost,
    mergedIntoOwnBrand: mergeIntoOwnBrand,
    productionCostFactor: ACQUIRED_BRAND_PRODUCTION_COST_FACTOR,
    cash: 0,
    unitsShippedThisMonth: 0,
    profitThisMonth: 0,
    lastMonthUnitsShipped: 0,
    lastMonthProfit: 0,
    lifetimeUnitsShipped: 0,
    lifetimeProfit: 0,
  };
  state.acquiredManufacturer = acquired;
  state.manufacturerAcquisitionTargets = state.manufacturerAcquisitionTargets.filter((k) => k !== franchiseKey);

  return { ok: true };
}

/** Call after a factory-owned dealership successfully orders a unit — books the acquired manufacturer's own margin on that unit, same pattern as Manufacturer Co.'s recordHouseBrandShipment. No-op once merged (a merged brand's shipments already flow through Manufacturer Co. itself). */
export function recordAcquiredBrandShipment(state: GameState, model: VehicleModel): void {
  const am = state.acquiredManufacturer;
  if (!am || !am.owned || am.mergedIntoOwnBrand) return;
  const productionCost = model.invoice * am.productionCostFactor;
  const profit = model.invoice - productionCost;
  am.cash += profit;
  am.unitsShippedThisMonth += 1;
  am.profitThisMonth += profit;
  am.lifetimeUnitsShipped += 1;
  am.lifetimeProfit += profit;
}

/** Run once per in-game month: rolls this month's shipment stats into "last month." */
export function monthlyAcquiredManufacturerCycle(state: GameState): void {
  const am = state.acquiredManufacturer;
  if (!am || !am.owned) return;
  am.lastMonthUnitsShipped = am.unitsShippedThisMonth;
  am.lastMonthProfit = am.profitThisMonth;
  am.unitsShippedThisMonth = 0;
  am.profitThisMonth = 0;
}

export function sweepAcquiredManufacturerCash(state: GameState): number {
  const am = state.acquiredManufacturer;
  if (!am || !am.owned) return 0;
  const amount = am.cash;
  if (amount <= 0) return 0;
  am.cash = 0;
  state.groupTreasury += amount;
  return amount;
}
