// ---------------------------------------------------------------------------
// Parts Warehouse — a group-level distribution business. Chartering one does
// two things at once: every store in the group restocks parts at a wholesale
// discount instead of retail (a real, ongoing cost saving that scales with
// how many rooftops you own), and whatever capacity the group doesn't use
// itself gets sold to outside shops for straight profit. Tracked as one
// aggregate throughput number rather than a per-part ledger, same reasoning
// as the Captive Lender's aggregate loan portfolio.
// ---------------------------------------------------------------------------
import type { GameState, PartsWarehouseState } from "../types.js";
import { postCashExpense } from "./financials.js";
import { RETAIL_PARTS_UNIT_COST } from "./service.js";

const CHARTER_COST = 400_000;
const BASE_THROUGHPUT = 1000; // units/month once chartered
const CAPACITY_UPGRADE_UNITS = 500;
const CAPACITY_BASE_COST = 60_000;
const CAPACITY_COST_GROWTH = 1.22;
const MAX_CAPACITY_UPGRADES = 24;

export const WAREHOUSE_INTERNAL_UNIT_COST = 40; // what the group's own stores pay per unit once chartered, vs. RETAIL_PARTS_UNIT_COST
const EXTERNAL_MARGIN_PER_UNIT = 20; // pure profit per unit sold to outside shops

export function newPartsWarehouse(): PartsWarehouseState {
  return {
    chartered: false,
    charterDay: -1,
    cash: 0,
    throughputCapacity: 0,
    lastMonthInternalUnits: 0,
    lastMonthInternalSavings: 0,
    lastMonthExternalUnits: 0,
    lastMonthExternalProfit: 0,
    lifetimeInternalSavings: 0,
    lifetimeExternalProfit: 0,
  };
}

export function charterPartsWarehouseCost(): number {
  return CHARTER_COST;
}

export interface CharterResult {
  ok: boolean;
  reason?: string;
}

export type PartsWarehouseFunding = "active" | "treasury";

export function charterPartsWarehouse(state: GameState, funding: PartsWarehouseFunding, payerDealershipId: string): CharterResult {
  if (state.career.role === "gm") return { ok: false, reason: "Become an owner before chartering a parts warehouse." };
  if (state.partsWarehouse.chartered) return { ok: false, reason: "Already chartered." };

  if (funding === "treasury") {
    if (state.groupTreasury < CHARTER_COST) return { ok: false, reason: "Not enough in the group treasury." };
    state.groupTreasury -= CHARTER_COST;
  } else {
    const payer = state.dealerships[payerDealershipId];
    if (!payer) return { ok: false, reason: "Dealership not found." };
    if (payer.ledger.cash < CHARTER_COST) return { ok: false, reason: "Not enough cash on hand." };
    postCashExpense(payer, CHARTER_COST);
  }

  state.partsWarehouse.chartered = true;
  state.partsWarehouse.charterDay = state.day;
  state.partsWarehouse.throughputCapacity = BASE_THROUGHPUT;
  return { ok: true };
}

export function capacityUpgradeCount(state: GameState): number {
  return Math.round((state.partsWarehouse.throughputCapacity - BASE_THROUGHPUT) / CAPACITY_UPGRADE_UNITS);
}

export function capacityUpgradeCost(state: GameState): number {
  return Math.round(CAPACITY_BASE_COST * Math.pow(CAPACITY_COST_GROWTH, capacityUpgradeCount(state)));
}

export function capacityUpgradeMaxed(state: GameState): boolean {
  return capacityUpgradeCount(state) >= MAX_CAPACITY_UPGRADES;
}

/** Adds throughput capacity, funded from a store's own cash (this is a physical facility expansion, not something the treasury bankrolls at arm's length). */
export function investInWarehouseCapacity(state: GameState, payerDealershipId: string): boolean {
  if (!state.partsWarehouse.chartered || capacityUpgradeMaxed(state)) return false;
  const payer = state.dealerships[payerDealershipId];
  if (!payer) return false;
  const cost = capacityUpgradeCost(state);
  if (payer.ledger.cash < cost) return false;
  postCashExpense(payer, cost);
  state.partsWarehouse.throughputCapacity += CAPACITY_UPGRADE_UNITS;
  return true;
}

/** The per-unit parts cost every dealership's monthly restock should use — discounted once the warehouse is chartered. */
export function partsUnitCostFor(state: GameState): number {
  return state.partsWarehouse.chartered ? WAREHOUSE_INTERNAL_UNIT_COST : RETAIL_PARTS_UNIT_COST;
}

/**
 * Run once per month after every dealership has restocked. `internalUnitsThisMonth`
 * is the sum of what monthlyServiceCycle() reported restocking, group-wide,
 * at the discounted unit cost. Whatever throughput is left over after that
 * internal demand sells externally for pure profit.
 */
export function monthlyPartsWarehouseCycle(state: GameState, internalUnitsThisMonth: number): void {
  const wh = state.partsWarehouse;
  if (!wh.chartered) {
    wh.lastMonthInternalUnits = 0;
    wh.lastMonthInternalSavings = 0;
    wh.lastMonthExternalUnits = 0;
    wh.lastMonthExternalProfit = 0;
    return;
  }

  const internalUnits = Math.min(internalUnitsThisMonth, wh.throughputCapacity);
  const internalSavings = internalUnits * (RETAIL_PARTS_UNIT_COST - WAREHOUSE_INTERNAL_UNIT_COST);
  const externalUnits = Math.max(0, wh.throughputCapacity - internalUnitsThisMonth);
  const externalProfit = externalUnits * EXTERNAL_MARGIN_PER_UNIT;

  wh.cash += externalProfit;
  wh.lastMonthInternalUnits = internalUnits;
  wh.lastMonthInternalSavings = internalSavings;
  wh.lastMonthExternalUnits = externalUnits;
  wh.lastMonthExternalProfit = externalProfit;
  wh.lifetimeInternalSavings += internalSavings;
  wh.lifetimeExternalProfit += externalProfit;
}

/** Moves the warehouse's accumulated external-distribution cash into the Group Treasury. Returns the amount swept. */
export function sweepPartsWarehouseCash(state: GameState): number {
  const amount = state.partsWarehouse.cash;
  if (amount <= 0) return 0;
  state.partsWarehouse.cash = 0;
  state.groupTreasury += amount;
  return amount;
}
