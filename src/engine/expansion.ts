import type { CompetitorTarget, Dealership, FranchiseKey, GameState, StaffMember } from "../types.js";
import { Rng } from "../rng.js";
import { nextId, createDealership } from "../state.js";
import { monthIndex } from "./clock.js";
import { postCashExpense, financeAcquisition, totalAssets, totalLiabilities, distributeToOwner, injectCapital } from "./financials.js";
import { makeVehicle } from "./acquisition.js";
import { BASE_SALARY } from "./staffing.js";
import { applyFactoryOwnership } from "./manufacturerAcquisition.js";
import { ALL_FRANCHISE_MODELS, FRANCHISE_CATALOGS, FRANCHISE_OPTIONS, STAFF_FIRST_NAMES, STAFF_LAST_NAMES, getFranchiseOption } from "../constants.js";

const TARGETS_PER_MONTH = 3;

interface SizeTierSpec {
  vehicles: [number, number];
  staff: [number, number];
}
const SIZE_TIERS: Record<CompetitorTarget["sizeTier"], SizeTierSpec> = {
  small: { vehicles: [8, 18], staff: [3, 5] },
  mid: { vehicles: [18, 34], staff: [5, 9] },
  large: { vehicles: [34, 55], staff: [9, 14] },
};
const SIZE_TIER_ROLL: CompetitorTarget["sizeTier"][] = ["small", "small", "mid", "mid", "large"];
const NAME_PREFIXES = ["Westgate", "Lakeside", "Parkview", "Northbrook", "Fairview", "Summit Ridge", "Riverside", "Highland", "Coastal", "Midtown"];
const NAME_SUFFIXES = ["Auto Group", "Motors", "Automotive", "Superstore", "Auto Plaza"];

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function generateOneTarget(rng: Rng): CompetitorTarget {
  const option = rng.pick(FRANCHISE_OPTIONS);
  const catalog = FRANCHISE_CATALOGS[option.key];
  const avgMsrp = catalog.length > 0 ? catalog.reduce((s, m) => s + m.msrp, 0) / catalog.length : 30000;
  const avgVehicleValue = avgMsrp * 0.75; // blended new/used stock on a real lot

  const sizeTier = rng.pick(SIZE_TIER_ROLL);
  const spec = SIZE_TIERS[sizeTier];
  const vehicleCount = rng.int(spec.vehicles[0], spec.vehicles[1]);
  const staffCount = rng.int(spec.staff[0], spec.staff[1]);
  const reputation = Math.round(rng.range(35, 78));
  const csi = Math.round(rng.range(42, 78));

  const inventoryValue = vehicleCount * avgVehicleValue * rng.range(0.75, 1.05);
  const goodwill = staffCount * 14000 + reputation * 2200 + csi * 1600;
  const askingPrice = Math.round((inventoryValue + goodwill) * rng.range(1.05, 1.3) / 1000) * 1000;

  const name = `${rng.pick(NAME_PREFIXES)} ${option.brand} ${rng.pick(NAME_SUFFIXES)}`;

  return {
    id: nextId("target"),
    name,
    franchiseKey: option.key,
    brand: option.brand,
    sizeTier,
    askingPrice,
    vehicleCount,
    staffCount,
    reputation,
    csi,
  };
}

/**
 * Competitor dealerships currently up for sale, refreshed once a month (or
 * sooner if the player buys the whole list out) so there's always a real,
 * ongoing way to keep expanding — not a one-time career milestone.
 */
export function acquisitionTargetsForMonth(state: GameState, rng: Rng): CompetitorTarget[] {
  const idx = monthIndex(state.day);
  if (state.acquisitionTargetsMonth !== idx || state.acquisitionTargets.length === 0) {
    state.acquisitionTargets = Array.from({ length: TARGETS_PER_MONTH }, () => generateOneTarget(rng));
    state.acquisitionTargetsMonth = idx;
  }
  return state.acquisitionTargets;
}

function buildAcquiredDealership(rng: Rng, id: string, target: CompetitorTarget, day: number): Dealership {
  // Most of the purchase price paid for the inventory and team already on
  // the books, not a cash pile — a modest working-capital cushion comes along.
  const startingCapital = Math.max(20000, Math.round(target.askingPrice * 0.12));
  const d = createDealership(rng, id, target.name, target.franchiseKey, day, startingCapital);

  d.reputation = target.reputation;
  d.manufacturer.csi = target.csi;
  d.manufacturer.facilityStandards = Math.round(clamp(target.csi + rng.range(-10, 10), 30, 95));

  const salesCount = Math.max(1, Math.round(target.staffCount * 0.4));
  const fiCount = Math.max(1, Math.round(target.staffCount * 0.15));
  const advisorCount = Math.max(1, Math.round(target.staffCount * 0.15));
  const techCount = Math.max(1, target.staffCount - salesCount - fiCount - advisorCount);
  const roles: StaffMember["role"][] = [
    ...Array(salesCount).fill("salesperson"),
    ...Array(fiCount).fill("fi_manager"),
    ...Array(advisorCount).fill("service_advisor"),
    ...Array(techCount).fill("service_tech"),
  ];
  const staff: StaffMember[] = roles.map((role) => ({
    id: nextId("staff"),
    name: `${rng.pick(STAFF_FIRST_NAMES)} ${rng.pick(STAFF_LAST_NAMES)}`,
    role,
    skill: Math.round(rng.range(50, 80)), // an established team, not day-one hires
    experienceDays: rng.int(180, 1500),
    morale: rng.int(55, 85),
    monthlySalary: BASE_SALARY[role],
    commissionRate: role === "salesperson" ? 0.2 : role === "fi_manager" ? 0.08 : undefined,
    dealsThisMonth: 0,
    grossThisMonth: 0,
    incentivesThisMonth: 0,
  }));
  d.staff = staff;
  d.service.techs = staff.filter((s) => s.role === "service_tech");
  d.service.advisors = staff.filter((s) => s.role === "service_advisor");

  const catalog = FRANCHISE_CATALOGS[target.franchiseKey];
  for (let i = 0; i < target.vehicleCount; i++) {
    const seed = catalog.length > 0 ? rng.pick(catalog) : rng.pick(ALL_FRANCHISE_MODELS);
    const isNew = catalog.length > 0 && rng.chance(0.45);
    const model = { name: seed.name, trim: seed.trim, class: seed.class, msrp: seed.msrp, invoice: Math.round(seed.msrp * seed.invoiceFrac), desirability: seed.desirability };
    const odometer = isNew ? rng.int(4, 15) : rng.int(15000, 85000);
    const v = makeVehicle(model, isNew ? "new" : "used", isNew ? "allocation" : "auction", day, rng, odometer);
    const cost = isNew ? model.invoice : Math.round(model.invoice * rng.range(0.55, 0.8));
    financeAcquisition(d, v, cost);
    v.stage = "listed";
    v.listPrice = isNew ? model.msrp : Math.round(cost * 1.18);
    v.daysInInventory = rng.int(1, 45);
    v.daysInStage = v.daysInInventory;
    d.vehicles.push(v);
  }

  return d;
}

export interface AcquireResult {
  ok: boolean;
  reason?: string;
  newDealershipId?: string;
}

/** Buy a competitor dealership outright, paid in cash from the buying store, folding it into the player's group as a new, already-established rooftop. */
export function buyCompetitorDealership(state: GameState, buyerDealershipId: string, targetId: string, rng: Rng): AcquireResult {
  if (state.career.role === "gm") return { ok: false, reason: "Become an owner before acquiring other dealerships." };
  const buyer = state.dealerships[buyerDealershipId];
  if (!buyer) return { ok: false, reason: "Dealership not found." };
  const targets = acquisitionTargetsForMonth(state, rng);
  const target = targets.find((t) => t.id === targetId);
  if (!target) return { ok: false, reason: "That listing is no longer available." };
  if (buyer.ledger.cash < target.askingPrice) return { ok: false, reason: "Not enough cash on hand." };

  postCashExpense(buyer, target.askingPrice);

  const newId = nextId("dlr");
  const acquired = buildAcquiredDealership(rng, newId, target, state.day);
  acquired.acquiredDay = state.day;
  acquired.acquiredCost = target.askingPrice;
  state.dealerships[newId] = acquired;
  state.acquisitionTargets = state.acquisitionTargets.filter((t) => t.id !== targetId);

  return { ok: true, newDealershipId: newId };
}

const NEW_ROOFTOP_GROUP_NAMES = ["Summit", "Harbor", "Crossroads", "Union", "Cascade", "Meridian", "Vanguard", "Anchor", "Trailhead", "Overlook"];

/** What it costs to stand up a brand-new rooftop from scratch for a given franchise — steeper than the one-time career milestone's discounted capital, since there's no employer subsidizing this one. */
export function newRooftopCost(franchiseKey: FranchiseKey): number {
  const option = getFranchiseOption(franchiseKey);
  return Math.round(option.startingCash * 1.15);
}

export type FundingSource = "active" | "treasury";

/**
 * Build a brand-new rooftop for a franchise, from nothing — a repeatable
 * counterpart to the one-time GM->owner milestone's "new_rooftop" choice
 * (which can only ever fire once). Funded either from an existing store's
 * own cash or from the pooled group treasury.
 */
export function buildNewRooftop(state: GameState, funding: FundingSource, payerDealershipId: string, franchiseKey: FranchiseKey, rng: Rng): AcquireResult {
  if (state.career.role === "gm") return { ok: false, reason: "Become an owner before opening another rooftop." };
  const cost = newRooftopCost(franchiseKey);

  if (funding === "treasury") {
    if (state.groupTreasury < cost) return { ok: false, reason: "Not enough in the group treasury." };
    state.groupTreasury -= cost;
  } else {
    const payer = state.dealerships[payerDealershipId];
    if (!payer) return { ok: false, reason: "Dealership not found." };
    if (payer.ledger.cash < cost) return { ok: false, reason: "Not enough cash on hand." };
    postCashExpense(payer, cost);
  }

  const newId = nextId("dlr");
  const brand = getFranchiseOption(franchiseKey).brand;
  const groupName = `${rng.pick(NEW_ROOFTOP_GROUP_NAMES)} ${brand}`;
  const newDealership = createDealership(rng, newId, groupName, franchiseKey, state.day);
  // If this franchise's manufacturing is one you already bought outright
  // (and kept independent rather than merging), a brand-new rooftop of it
  // opens already factory-owned — you own the plant, so every store you
  // open under it inherits that, not just the ones that existed at the
  // time you bought it.
  const am = state.acquiredManufacturer;
  if (am?.owned && !am.mergedIntoOwnBrand && am.franchiseKey === franchiseKey) {
    applyFactoryOwnership(newDealership);
  }
  state.dealerships[newId] = newDealership;
  return { ok: true, newDealershipId: newId };
}

export interface SellResult {
  ok: boolean;
  reason?: string;
  proceeds?: number;
}

/** What another buyer would realistically pay for this store: book equity plus goodwill for reputation/team/CSI, at a buyer's-market discount. */
export function appraiseDealership(d: Dealership): number {
  const bookEquity = totalAssets(d) - totalLiabilities(d);
  const goodwill = d.staff.length * 9000 + d.reputation * 1400 + d.manufacturer.csi * 1100;
  return Math.max(15000, Math.round((bookEquity + goodwill) * 0.82));
}

/**
 * Sell an owned dealership outright. Proceeds land in the pooled group
 * treasury (not the selling store's own cash, since the store itself is
 * going away) so the money is immediately usable across the rest of the
 * group rather than orphaned in a dealership that no longer exists.
 */
export function sellDealership(state: GameState, dealershipId: string): SellResult {
  const d = state.dealerships[dealershipId];
  if (!d) return { ok: false, reason: "Dealership not found." };
  if (Object.keys(state.dealerships).length <= 1) return { ok: false, reason: "You can't sell your only dealership." };

  const proceeds = appraiseDealership(d);
  state.groupTreasury += proceeds;
  delete state.dealerships[dealershipId];
  if (state.activeDealershipId === dealershipId) {
    state.activeDealershipId = Object.keys(state.dealerships)[0];
  }
  return { ok: true, proceeds };
}

/** Move cash from a store's own books into the pooled group treasury. */
export function transferToTreasury(state: GameState, dealershipId: string, amount: number): boolean {
  const d = state.dealerships[dealershipId];
  if (!d || amount <= 0 || d.ledger.cash < amount) return false;
  distributeToOwner(d, amount);
  state.groupTreasury += amount;
  return true;
}

/**
 * Run once per month, per dealership, right after that store's own month
 * closes out (overhead/payroll/floor-plan interest already paid, net
 * income already booked) — sweeps whatever cash sits above the store's own
 * working-capital threshold into the Group Treasury, so a player running a
 * large group isn't stuck manually moving money out of a dozen-plus
 * accounts by hand. Leaves the threshold itself behind so the store can
 * still cover its own floor-plan curtailment and day-to-day expenses.
 */
export function autoSweepDealership(state: GameState, d: Dealership): void {
  if (!d.autoPilot.treasury) return;
  const surplus = d.ledger.cash - d.autoSweepThreshold;
  if (surplus <= 0) return;
  distributeToOwner(d, surplus);
  state.groupTreasury += surplus;
}

/** Move cash from the pooled group treasury into a store's own books. */
export function transferFromTreasury(state: GameState, dealershipId: string, amount: number): boolean {
  const d = state.dealerships[dealershipId];
  if (!d || amount <= 0 || state.groupTreasury < amount) return false;
  state.groupTreasury -= amount;
  injectCapital(d, amount);
  return true;
}

/**
 * The reverse of autoSweepDealership: when a store's own cash has fallen
 * below its working-capital threshold, top it back up out of the pooled
 * Group Treasury (whatever the treasury can actually cover — a partial
 * rescue is still better than none). Runs daily rather than monthly like
 * the sweep-out does, because floor-plan violation severity accrues daily
 * and never decays — a struggling store can slide into an audit failure
 * well before the next month-end sweep would ever reach it. Returns the
 * amount actually injected (0 if autopilot is off, the store isn't short,
 * or the treasury itself is empty).
 */
export function autoRescueDealership(state: GameState, d: Dealership): number {
  if (!d.autoPilot.treasury) return 0;
  if (d.ledger.cash >= d.autoSweepThreshold) return 0;
  const needed = d.autoSweepThreshold - d.ledger.cash;
  const amount = Math.min(needed, state.groupTreasury);
  if (amount <= 0) return 0;
  transferFromTreasury(state, d.id, amount);
  return amount;
}
