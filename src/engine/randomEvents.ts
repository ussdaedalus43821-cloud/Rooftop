// ---------------------------------------------------------------------------
// Random events — the things that happen to a real dealership beyond its own
// P&L decisions. Each physical/liability event books its loss through a
// primitive that already exists (capitalizeRecon for a repaired unit, a
// straight write-off for a totaled one, postCashExpense for a pure
// liability payout) and then, if the store carries coverage, recovers most
// of it via insurance/fileInsuranceClaim — nothing here invents a second
// loss-accounting system. A manufacturer recall and a compliance fine are
// the "political/regulatory" side: real costs of doing business that
// insurance was never meant to cover.
//
// About a third of these carry a real (not guaranteed) chance of a
// follow-up ripple — ScheduledRipple entries resolved on a later day, not
// stacked onto the same day — so an incident occasionally turns into a
// genuinely bad month without every incident spiraling. Modest, existing
// stats (reputation, CSI, compliance strikes) nudge a few of the chances,
// so a well-run store is playing the odds slightly better, not immune.
// ---------------------------------------------------------------------------
import type { Dealership, GameState, RandomEventKind, RandomEventRecord, Vehicle } from "../types.js";
import { Rng } from "../rng.js";
import { capitalizeRecon, postCashExpense } from "./financials.js";
import { fileInsuranceClaim } from "./insurance.js";
import { activeNegotiations } from "./salesFloor.js";
import { unitsOnLot } from "./inventory.js";
import { toCalendarDate } from "./clock.js";
import { MAX_SERVICE_QUEUE } from "./service.js";

const EVENT_LOG_CAP = 60;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function logEvent(state: GameState, d: Dealership, day: number, kind: RandomEventKind, headline: string, detail: string, lossAmount: number, insurancePayout: number, isRipple: boolean): RandomEventRecord {
  const record: RandomEventRecord = { day, dealershipId: d.id, dealershipName: d.name, kind, headline, detail, lossAmount, insurancePayout, isRipple };
  state.eventLog.push(record);
  if (state.eventLog.length > EVENT_LOG_CAP) state.eventLog.shift();
  return record;
}

function scheduleRipple(state: GameState, d: Dealership, day: number, delayMin: number, delayMax: number, kind: RandomEventKind, rng: Rng, lossAmount?: number): void {
  state.scheduledRipples.push({ day: day + rng.int(delayMin, delayMax), dealershipId: d.id, kind, lossAmount });
}

/** Removes a vehicle as a total loss (stolen, or wrecked beyond repair) — a straight write-off against equity, same as any asset that's simply gone. The floor-plan balance owed on it, if any, is untouched: a real lender's lien doesn't vanish with the collateral, which is exactly why GAP coverage exists in real life and standard insurance alone doesn't always make a dealer whole. A vehicle can be mid-deal when this happens (stage alone doesn't mark it reserved), so any deal pointing at it is closed out here too — otherwise it lingers as a ghost entry with a vehicleId that resolves to nothing, and one already past negotiation (agreed/fi) has no other cleanup path and would sit stuck in the F&I queue forever. */
function writeOffVehicle(d: Dealership, vehicle: Vehicle): number {
  const bookValue = vehicle.acquisitionCost + vehicle.reconCost;
  d.ledger.vehicleInventoryValue -= bookValue;
  d.ledger.retainedEarnings -= bookValue;
  d.vehicles = d.vehicles.filter((v) => v.id !== vehicle.id);
  for (const deal of d.deals) {
    if (deal.vehicleId !== vehicle.id) continue;
    if (deal.stage === "negotiating" || deal.stage === "agreed" || deal.stage === "fi") {
      deal.stage = "lost";
      deal.log.push(`The ${vehicle.model.name} was written off before the deal could close.`);
    }
  }
  return bookValue;
}

// --- Test-drive collision ---------------------------------------------------

const COLLISION_CHANCE_PER_DEAL = 0.0008;
const COLLISION_MINOR_MAX = 3000;
const COLLISION_MODERATE_MAX = 9000;
const COLLISION_INJURY_RIPPLE_CHANCE = 0.15;
const COLLISION_INJURY_MIN = 10_000;
const COLLISION_INJURY_MAX = 40_000;

function tryTestDriveCollision(state: GameState, d: Dealership, rng: Rng, day: number): RandomEventRecord | null {
  const deals = activeNegotiations(d);
  if (deals.length === 0) return null;
  if (!rng.chance(COLLISION_CHANCE_PER_DEAL * deals.length)) return null;
  const deal = rng.pick(deals);
  const vehicle = d.vehicles.find((v) => v.id === deal.vehicleId);
  if (!vehicle) return null;

  const severityRoll = rng.next();
  let lossAmount: number;
  let severityLabel: string;
  if (severityRoll < 0.5) {
    lossAmount = Math.round(rng.range(800, COLLISION_MINOR_MAX));
    severityLabel = "a fender-bender";
    capitalizeRecon(d, vehicle, lossAmount);
  } else if (severityRoll < 0.85) {
    lossAmount = Math.round(rng.range(COLLISION_MINOR_MAX, COLLISION_MODERATE_MAX));
    severityLabel = "moderate damage";
    capitalizeRecon(d, vehicle, lossAmount);
  } else {
    lossAmount = writeOffVehicle(d, vehicle);
    severityLabel = "a total loss";
  }

  const { payout } = fileInsuranceClaim(d, day, "Test-drive collision", lossAmount);
  const record = logEvent(state, d, day, "test_drive_collision",
    `${d.name}: a test drive ended in ${severityLabel}.`,
    `${deal.customer.name} was test-driving a ${vehicle.model.name} when it was involved in a collision — ${severityLabel} (${money(lossAmount)}).`,
    lossAmount, payout, false);

  if (severityRoll >= 0.5 && rng.chance(COLLISION_INJURY_RIPPLE_CHANCE)) {
    scheduleRipple(state, d, day, 10, 25, "test_drive_injury_escalation", rng, Math.round(rng.range(COLLISION_INJURY_MIN, COLLISION_INJURY_MAX)));
  }
  return record;
}

// --- Hailstorm (weather, group-wide) ----------------------------------------

const HAILSTORM_BASE_CHANCE = 0.00025;
const HAILSTORM_SEASON_MULT = 2.5;
const HAILSTORM_SEASON_MONTHS = [2, 3, 4, 5]; // March-June, 0-indexed
const HAILSTORM_MAX_STORES_HIT = 3;
const HAILSTORM_DAMAGE_SHARE = [0.05, 0.2] as const;
const HAILSTORM_UNIT_DAMAGE_FRACTION = [0.1, 0.3] as const;
const HAILSTORM_BACKLOG_RIPPLE_CHANCE = 0.25;
const HAILSTORM_BACKLOG_COST_SHARE = 0.15;

function tryHailstorm(state: GameState, rng: Rng, day: number): RandomEventRecord[] {
  const seasonMult = HAILSTORM_SEASON_MONTHS.includes(toCalendarDate(day).month) ? HAILSTORM_SEASON_MULT : 1;
  if (!rng.chance(HAILSTORM_BASE_CHANCE * seasonMult)) return [];

  const owned = Object.values(state.dealerships).filter((d) => !d.failure);
  if (owned.length === 0) return [];
  const hitCount = Math.min(owned.length, rng.int(1, HAILSTORM_MAX_STORES_HIT));
  const pool = [...owned];
  const hitStores: Dealership[] = [];
  for (let i = 0; i < hitCount && pool.length > 0; i++) {
    hitStores.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]);
  }

  const records: RandomEventRecord[] = [];
  for (const d of hitStores) {
    const lot = d.vehicles.filter((v) => v.stage !== "sold");
    if (lot.length === 0) continue;
    const damagedCount = Math.max(1, Math.round(lot.length * rng.range(...HAILSTORM_DAMAGE_SHARE)));
    let totalDamage = 0;
    const pickPool = [...lot];
    for (let i = 0; i < damagedCount && pickPool.length > 0; i++) {
      const vehicle = pickPool.splice(rng.int(0, pickPool.length - 1), 1)[0];
      const unitValue = vehicle.acquisitionCost + vehicle.reconCost;
      const damage = Math.round(unitValue * rng.range(...HAILSTORM_UNIT_DAMAGE_FRACTION));
      capitalizeRecon(d, vehicle, damage);
      totalDamage += damage;
    }
    if (totalDamage <= 0) continue;

    const { payout } = fileInsuranceClaim(d, day, "Hailstorm", totalDamage);
    const record = logEvent(state, d, day, "hailstorm",
      `${d.name}: hailstorm damaged ${damagedCount} vehicles on the lot.`,
      `A regional hailstorm dinged up ${damagedCount} units — ${money(totalDamage)} in cosmetic and mechanical damage.`,
      totalDamage, payout, false);
    records.push(record);

    if (rng.chance(HAILSTORM_BACKLOG_RIPPLE_CHANCE)) {
      scheduleRipple(state, d, day, 15, 25, "hailstorm_recon_backlog", rng, Math.round(totalDamage * HAILSTORM_BACKLOG_COST_SHARE));
    }
  }
  return records;
}

// --- Lot theft/vandalism -----------------------------------------------------

const THEFT_CHANCE_PER_UNIT = 0.00003;
const THEFT_REPEAT_RIPPLE_CHANCE = 0.2;

function tryLotTheft(state: GameState, d: Dealership, rng: Rng, day: number): RandomEventRecord | null {
  const lot = unitsOnLot(d);
  if (lot.length === 0) return null;
  if (!rng.chance(THEFT_CHANCE_PER_UNIT * lot.length)) return null;
  const vehicle = rng.pick(lot);
  const lossAmount = writeOffVehicle(d, vehicle);
  const { payout } = fileInsuranceClaim(d, day, "Lot theft/vandalism", lossAmount);
  const record = logEvent(state, d, day, "lot_theft",
    `${d.name}: a ${vehicle.model.name} was stolen off the lot overnight.`,
    `Overnight theft — ${money(lossAmount)} unit gone, reported to police and the insurer.`,
    lossAmount, payout, false);
  d.reputation = clamp(d.reputation - 1, 0, 100);

  if (rng.chance(THEFT_REPEAT_RIPPLE_CHANCE)) {
    scheduleRipple(state, d, day, 10, 20, "lot_theft_repeat", rng);
  }
  return record;
}

function resolveTheftRepeat(state: GameState, d: Dealership, rng: Rng, day: number): RandomEventRecord | null {
  const lot = unitsOnLot(d);
  if (lot.length === 0) return null;
  const vehicle = rng.pick(lot);
  const lossAmount = writeOffVehicle(d, vehicle);
  const { payout } = fileInsuranceClaim(d, day, "Repeat lot theft", lossAmount);
  d.reputation = clamp(d.reputation - 2, 0, 100);
  return logEvent(state, d, day, "lot_theft_repeat",
    `${d.name}: a second theft — whoever hit you the first time came back.`,
    `Same lot, another ${vehicle.model.name} gone (${money(lossAmount)}) — worth a hard look at lot security.`,
    lossAmount, payout, true);
}

// --- Service bay mishap -------------------------------------------------------

const SERVICE_MISHAP_CHANCE_PER_JOB = 0.000015;
const SERVICE_MISHAP_COST = [2000, 12_000] as const;
const SERVICE_MISHAP_CSI_HIT = 3;
const SERVICE_MISHAP_ESCALATION_CHANCE = 0.2;
const SERVICE_MISHAP_ESCALATION = [8000, 25_000] as const;

function tryServiceBayMishap(state: GameState, d: Dealership, rng: Rng, day: number): RandomEventRecord | null {
  const jobCount = d.service.jobs.length;
  if (jobCount === 0) return null;
  if (!rng.chance(SERVICE_MISHAP_CHANCE_PER_JOB * jobCount)) return null;
  const cost = Math.round(rng.range(...SERVICE_MISHAP_COST));
  postCashExpense(d, cost);
  const { payout } = fileInsuranceClaim(d, day, "Service bay mishap", cost);
  d.manufacturer.csi = clamp(d.manufacturer.csi - SERVICE_MISHAP_CSI_HIT, 0, 100);
  const record = logEvent(state, d, day, "service_bay_mishap",
    `${d.name}: a customer's car was damaged in the service bay.`,
    `A tech backed a customer's vehicle into a lift — ${money(cost)} to make it right, and it stung the shop's reputation.`,
    cost, payout, false);

  if (rng.chance(SERVICE_MISHAP_ESCALATION_CHANCE)) {
    scheduleRipple(state, d, day, 10, 20, "service_bay_liability_escalation", rng, Math.round(rng.range(...SERVICE_MISHAP_ESCALATION)));
  }
  return record;
}

// --- Slip-and-fall liability ---------------------------------------------------

const SLIP_FALL_BASE_CHANCE = 0.00004;
const SLIP_FALL_COST = [5000, 25_000] as const;
const SLIP_FALL_REPUTATION_HIT = 2;
const SLIP_FALL_ESCALATION_CHANCE = 0.2;
const SLIP_FALL_ESCALATION = [10_000, 50_000] as const;

function trySlipAndFall(state: GameState, d: Dealership, rng: Rng, day: number): RandomEventRecord | null {
  const trafficFactor = 0.6 + d.reputation / 100; // a busier lot sees more foot traffic, and more exposure with it
  if (!rng.chance(SLIP_FALL_BASE_CHANCE * trafficFactor)) return null;
  const cost = Math.round(rng.range(...SLIP_FALL_COST));
  postCashExpense(d, cost);
  const { payout } = fileInsuranceClaim(d, day, "Slip-and-fall liability", cost);
  d.reputation = clamp(d.reputation - SLIP_FALL_REPUTATION_HIT, 0, 100);
  const record = logEvent(state, d, day, "slip_and_fall",
    `${d.name}: a slip-and-fall claim on the lot.`,
    `A visitor was hurt on the lot and filed a liability claim — ${money(cost)}.`,
    cost, payout, false);

  if (rng.chance(SLIP_FALL_ESCALATION_CHANCE)) {
    scheduleRipple(state, d, day, 15, 30, "slip_and_fall_escalation", rng, Math.round(rng.range(...SLIP_FALL_ESCALATION)));
  }
  return record;
}

// --- Manufacturer recall (political/regulatory, not insurable) ---------------
//
// Unlike the other event kinds, a recall doesn't resolve itself the moment it
// fires — the player gets a real choice, same as a dealer actually does: pay
// the manufacturer's rate to have it expedited (fast, costs cash, never
// touches your own shop or CSI), or run it through your own service queue for
// free and gamble on clearing the backlog before the manufacturer comes back
// to check (the same compliance-strike risk this used to apply automatically).
// tryManufacturerRecall only rolls the numbers and returns an unresolved
// notice; resolveManufacturerRecallChoice (called once the player picks) does
// the actual work and is the only place that writes to eventLog for it.

const RECALL_CHANCE = 0.00002;
const RECALL_JOBS = [5, 15] as const;
const RECALL_EXPEDITE_COST_PER_JOB = [180, 350] as const;
const RECALL_CSI_HIT = 2;
const RECALL_QUEUE_ESCALATION_THRESHOLD = 0.7;

function tryManufacturerRecall(state: GameState, d: Dealership, rng: Rng, day: number): RandomEventRecord | null {
  if (d.isHouseBrand || d.factoryOwned || d.isUsedOnly) return null; // no real manufacturer relationship to issue one
  if (!rng.chance(RECALL_CHANCE)) return null;
  const jobsToAdd = Math.min(rng.int(...RECALL_JOBS), Math.max(0, MAX_SERVICE_QUEUE - d.service.jobs.length));
  const expediteCost = Math.round(jobsToAdd * rng.range(...RECALL_EXPEDITE_COST_PER_JOB));
  return {
    day, dealershipId: d.id, dealershipName: d.name, kind: "manufacturer_recall",
    headline: `${d.name}: a manufacturer recall just landed.`,
    detail: `${jobsToAdd} vehicles need recall work. Pay the manufacturer's rate to have it expedited now, or run it through your own shop for free and risk a compliance strike if the backlog isn't cleared before they check back.`,
    lossAmount: expediteCost, insurancePayout: 0, isRipple: false, jobsToAdd,
  };
}

/** Resolves a manufacturer_recall notice once the player picks "pay" (expedite) or "contest" (run it through the shop and gamble on the backlog) — the only place that applies the recall's real consequences and logs the outcome. */
export function resolveManufacturerRecallChoice(state: GameState, event: RandomEventRecord, choice: "pay" | "contest", rng: Rng): void {
  const d = state.dealerships[event.dealershipId];
  if (!d) return;
  const day = event.day;
  if (choice === "pay") {
    postCashExpense(d, event.lossAmount);
    logEvent(state, d, day, "manufacturer_recall", `${d.name}: paid to expedite a manufacturer recall.`,
      `Paid ${money(event.lossAmount)} to have the manufacturer's own team expedite the recall — it never touched your shop or your CSI score.`,
      event.lossAmount, 0, false);
    return;
  }
  const jobsToAdd = event.jobsToAdd ?? 0;
  for (let i = 0; i < jobsToAdd; i++) {
    d.service.jobs.push({
      id: `recall_${d.id}_${day}_${i}`,
      kind: "warranty",
      hoursRequired: Math.round(rng.range(1, 4) * 10) / 10,
      hoursCompleted: 0,
      laborRate: d.service.warrantyRate,
      partsCost: Math.round(rng.range(40, 300)),
      partsAvailable: rng.chance(d.service.parts.fillRate),
    });
  }
  d.manufacturer.csi = clamp(d.manufacturer.csi - RECALL_CSI_HIT, 0, 100);
  logEvent(state, d, day, "manufacturer_recall", `${d.name}: a manufacturer recall hit the service queue.`,
    `${jobsToAdd} recall repairs hit the service queue — customers won't be thrilled, and the manufacturer expects them cleared promptly.`,
    0, 0, false);
  scheduleRipple(state, d, day, 20, 30, "recall_compliance_strike", rng);
}

function resolveRecallCompliance(state: GameState, d: Dealership, day: number): RandomEventRecord | null {
  const queueFullFraction = d.service.jobs.length / MAX_SERVICE_QUEUE;
  if (queueFullFraction < RECALL_QUEUE_ESCALATION_THRESHOLD) return null; // backlog cleared in time — no consequence
  d.manufacturer.complianceStrikes += 1;
  return logEvent(state, d, day, "recall_compliance_strike",
    `${d.name}: the manufacturer flagged slow recall completion.`,
    `Recall repairs are still backed up — a compliance strike was recorded against the franchise.`,
    0, 0, true);
}

// --- Regulatory compliance fine (political, not insurable) -------------------
//
// Same deferred-choice shape as the recall: tryComplianceFine only rolls the
// fine and returns an unresolved notice. Paying immediately closes the case
// for the sticker amount and nothing more; contesting is a real gamble — a
// real (not guaranteed) chance the citation gets dismissed outright, against
// a real chance it comes back bigger, with a compliance strike for having
// pushed back and lost. A store already running hot on strikes or a weak CSI
// score has worse odds contesting, same as its franchise standing already
// does elsewhere.

const COMPLIANCE_FINE_CHANCE = 0.000015;
const COMPLIANCE_FINE_RANGE = [1500, 8000] as const;
const COMPLIANCE_FINE_ESCALATION_MULT = 2.2;

function tryComplianceFine(state: GameState, d: Dealership, rng: Rng, day: number): RandomEventRecord | null {
  if (!rng.chance(COMPLIANCE_FINE_CHANCE)) return null;
  const fine = Math.round(rng.range(...COMPLIANCE_FINE_RANGE));
  return {
    day, dealershipId: d.id, dealershipName: d.name, kind: "compliance_fine",
    headline: `${d.name}: a routine compliance audit found a paperwork lapse.`,
    detail: `State title/registration audit found a lapse — a ${money(fine)} fine, uninsurable. Pay it now to close the case, or contest it and risk a bigger penalty (and a compliance strike) if you lose.`,
    lossAmount: fine, insurancePayout: 0, isRipple: false,
  };
}

/** Resolves a compliance_fine notice once the player picks "pay" (closes the case for the sticker amount) or "contest" (a real chance of dismissal against a real chance of a bigger, strike-carrying penalty). */
export function resolveComplianceFineChoice(state: GameState, event: RandomEventRecord, choice: "pay" | "contest", rng: Rng): void {
  const d = state.dealerships[event.dealershipId];
  if (!d) return;
  const day = event.day;
  if (choice === "pay") {
    postCashExpense(d, event.lossAmount);
    logEvent(state, d, day, "compliance_fine", `${d.name}: paid a compliance fine in full.`,
      `Paid the ${money(event.lossAmount)} fine in full and promptly — the case is closed, no further review.`,
      event.lossAmount, 0, false);
    return;
  }
  const winChance = clamp(0.55 - d.manufacturer.complianceStrikes * 0.08 - Math.max(0, 60 - d.manufacturer.csi) / 150, 0.15, 0.65);
  if (rng.chance(winChance)) {
    logEvent(state, d, day, "compliance_fine", `${d.name}: contested a compliance fine and won.`,
      `Contested the fine and won — the citation was dismissed outright.`,
      0, 0, false);
    return;
  }
  const penalty = Math.round(event.lossAmount * COMPLIANCE_FINE_ESCALATION_MULT);
  postCashExpense(d, penalty);
  d.manufacturer.complianceStrikes += 1;
  logEvent(state, d, day, "compliance_fine_escalation", `${d.name}: contested a compliance fine and lost.`,
    `Contested the fine and lost — ${money(penalty)} with penalties, plus a compliance strike for pushing back.`,
    penalty, 0, false);
}

// --- Daily orchestration -----------------------------------------------------

/** Run once per in-game day, per dealership, from tickDealershipDay — checks every per-store event type and fires at most one (keeps the log readable; two unrelated incidents landing the same day is a rare enough coincidence not to bother modeling). */
export function dailyRandomEventCheck(state: GameState, d: Dealership, rng: Rng, day: number): RandomEventRecord | null {
  return (
    tryTestDriveCollision(state, d, rng, day) ??
    tryLotTheft(state, d, rng, day) ??
    tryServiceBayMishap(state, d, rng, day) ??
    trySlipAndFall(state, d, rng, day) ??
    tryManufacturerRecall(state, d, rng, day) ??
    tryComplianceFine(state, d, rng, day)
  );
}

/** Run once per in-game day, at the state level (not per-dealership) — hail is regional, so it's rolled once and picks which of the group's stores it actually hits. */
export function dailyWeatherCheck(state: GameState, rng: Rng, day: number): RandomEventRecord[] {
  return tryHailstorm(state, rng, day);
}

/** Run once per in-game day — fires any ripple whose scheduled day has arrived. The dealership may no longer exist (sold, lost to a takeover, failed) by then, which is handled the same way any other stale reference is: skipped, not an error. */
export function resolveScheduledRipples(state: GameState, rng: Rng, day: number): RandomEventRecord[] {
  const due = state.scheduledRipples.filter((r) => r.day <= day);
  if (due.length === 0) return [];
  state.scheduledRipples = state.scheduledRipples.filter((r) => r.day > day);

  const records: RandomEventRecord[] = [];
  for (const ripple of due) {
    const d = state.dealerships[ripple.dealershipId];
    if (!d || d.failure) continue;
    const record = resolveRipple(state, d, rng, day, ripple.kind, ripple.lossAmount);
    if (record) records.push(record);
  }
  return records;
}

function resolveRipple(state: GameState, d: Dealership, rng: Rng, day: number, kind: RandomEventKind, lossAmount: number | undefined): RandomEventRecord | null {
  switch (kind) {
    case "test_drive_injury_escalation": {
      const amount = lossAmount ?? 15_000;
      const { payout } = fileInsuranceClaim(d, day, "Test-drive collision — injury escalation", amount);
      return logEvent(state, d, day, kind, `${d.name}: the test-drive collision escalated to an injury claim.`, `The customer involved sought treatment — an additional ${money(amount)} liability claim.`, amount, payout, true);
    }
    case "hailstorm_recon_backlog": {
      const amount = lossAmount ?? 0;
      if (amount <= 0) return null;
      postCashExpense(d, amount);
      return logEvent(state, d, day, kind, `${d.name}: still catching up on hail-damage recon.`, `The backlog from that hailstorm cost an extra ${money(amount)} in recon and sublet work.`, amount, 0, true);
    }
    case "lot_theft_repeat":
      return resolveTheftRepeat(state, d, rng, day);
    case "service_bay_liability_escalation": {
      const amount = lossAmount ?? 12_000;
      postCashExpense(d, amount);
      const { payout } = fileInsuranceClaim(d, day, "Service bay mishap — liability escalation", amount);
      return logEvent(state, d, day, kind, `${d.name}: the service bay mishap turned into a liability claim.`, `The customer wasn't satisfied with the repair alone — an additional ${money(amount)} claim followed.`, amount, payout, true);
    }
    case "slip_and_fall_escalation": {
      const amount = lossAmount ?? 20_000;
      postCashExpense(d, amount);
      const { payout } = fileInsuranceClaim(d, day, "Slip-and-fall — settlement escalation", amount);
      return logEvent(state, d, day, kind, `${d.name}: the slip-and-fall claim escalated.`, `The claim reopened for a larger settlement — an additional ${money(amount)}.`, amount, payout, true);
    }
    case "recall_compliance_strike":
      return resolveRecallCompliance(state, d, day);
    default:
      return null;
  }
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}
