import type { CompetitorTarget, Dealership, GameState, StaffMember } from "../types.js";
import { Rng } from "../rng.js";
import { nextId, createDealership } from "../state.js";
import { monthIndex } from "./clock.js";
import { postCashExpense, financeAcquisition } from "./financials.js";
import { makeVehicle } from "./acquisition.js";
import { BASE_SALARY } from "./staffing.js";
import { ALL_FRANCHISE_MODELS, FRANCHISE_CATALOGS, FRANCHISE_OPTIONS, STAFF_FIRST_NAMES, STAFF_LAST_NAMES } from "../constants.js";

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
  state.dealerships[newId] = buildAcquiredDealership(rng, newId, target, state.day);
  state.acquisitionTargets = state.acquisitionTargets.filter((t) => t.id !== targetId);

  return { ok: true, newDealershipId: newId };
}
