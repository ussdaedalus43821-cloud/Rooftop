import type { Dealership, ServiceBayJob } from "../types.js";
import { Rng } from "../rng.js";
import { nextId } from "../state.js";
import { postCashExpense, postGrossProfit, restockParts } from "./financials.js";

const TECH_HOURS_PER_DAY = 7;

// A backlog beyond this is well past anything the shop could realistically
// work through — customers stop waiting and take the car elsewhere instead
// of queuing forever, so new demand is turned away above the cap rather than
// piling up without limit.
const MAX_SERVICE_QUEUE = 150;

const BASE_BAY_COST = 18000;
const BAY_COST_GROWTH = 1.2;
const MAX_BAYS = 16;

export function effectiveBayHours(d: Dealership): number {
  const reconLoad = d.vehicles.filter((v) => v.stage === "reconditioning").length;
  const effectiveBays = Math.max(1, d.service.bays - reconLoad * 0.3);
  return effectiveBays * 8;
}

export function techCapacityHours(d: Dealership): number {
  return d.service.techs.reduce((sum, t) => sum + TECH_HOURS_PER_DAY * (0.6 + t.skill / 100), 0);
}

export function bayCost(d: Dealership): number {
  return Math.round(BASE_BAY_COST * Math.pow(BAY_COST_GROWTH, d.service.bays - 4));
}

/** Adds a bay (physical throughput capacity), capped so bay count can't run away from what a real facility could hold. */
export function investInBay(d: Dealership): boolean {
  if (d.service.bays >= MAX_BAYS) return false;
  const cost = bayCost(d);
  if (d.ledger.cash < cost) return false;
  postCashExpense(d, cost);
  d.service.bays += 1;
  return true;
}

export function generateDailyServiceJobs(d: Dealership, day: number, rng: Rng): void {
  if (d.service.jobs.length >= MAX_SERVICE_QUEUE) return;
  const advisorSkill = avgSkill(d.service.advisors, 45);

  // Customer-pay demand: driven by the store's own retained customer base
  // plus a smaller stream of walk-in/reputation-driven traffic.
  const retentionVisits = d.serviceCustomerBase * d.service.retentionRate * 0.012;
  const walkInVisits = (d.reputation / 100) * 1.4;
  const customerPayCount = Math.max(0, Math.round(rng.gaussian(retentionVisits + walkInVisits, 1)));
  for (let i = 0; i < customerPayCount && d.service.jobs.length < MAX_SERVICE_QUEUE; i++) {
    d.service.jobs.push(makeJob(d, "customerPay", rng, advisorSkill));
  }

  // Warranty work: required of a franchise dealer, billed at the lower
  // manufacturer-set reimbursement rate.
  const warrantyCount = Math.max(0, Math.round(rng.gaussian(unitsSoldRecently(d) * 0.02, 0.6)));
  for (let i = 0; i < warrantyCount && d.service.jobs.length < MAX_SERVICE_QUEUE; i++) {
    d.service.jobs.push(makeJob(d, "warranty", rng, advisorSkill));
  }
}

function unitsSoldRecently(d: Dealership): number {
  return d.monthlyHistory.slice(-3).reduce((s, m) => s + m.unitsSoldNew + m.unitsSoldUsed, 0) + d.currentMonth.unitsSoldNew + d.currentMonth.unitsSoldUsed;
}

function avgSkill(staff: { skill: number }[], fallback: number): number {
  if (staff.length === 0) return fallback;
  return staff.reduce((s, x) => s + x.skill, 0) / staff.length;
}

function makeJob(d: Dealership, kind: ServiceBayJob["kind"], rng: Rng, advisorSkill: number): ServiceBayJob {
  const hoursRequired = Math.round(rng.range(0.8, 4.5) * 10) / 10;
  const partsCost = Math.round(rng.range(20, 260));
  const partsAvailable = rng.chance(d.service.parts.fillRate);
  return {
    id: nextId("job"),
    kind,
    hoursRequired,
    hoursCompleted: 0,
    laborRate: kind === "warranty" ? d.service.warrantyRate : d.service.customerPayRate,
    partsCost,
    partsAvailable,
  };
}

export function processServiceJobs(d: Dealership, day: number, rng: Rng): void {
  const capacity = Math.min(techCapacityHours(d), effectiveBayHours(d));
  let remaining = capacity;
  const completed: ServiceBayJob[] = [];

  for (const job of d.service.jobs) {
    if (remaining <= 0) break;
    if (!job.partsAvailable && job.hoursCompleted === 0) {
      // First day on a special-ordered part is a wait, not wrench time.
      job.partsAvailable = rng.chance(0.34);
      continue;
    }
    const need = job.hoursRequired - job.hoursCompleted;
    const alloc = Math.min(need, remaining);
    job.hoursCompleted += alloc;
    remaining -= alloc;
    if (job.hoursCompleted >= job.hoursRequired - 1e-6) {
      completed.push(job);
    }
  }

  for (const job of completed) {
    finalizeJob(d, job);
  }
  d.service.jobs = d.service.jobs.filter((j) => !completed.includes(j));
}

function finalizeJob(d: Dealership, job: ServiceBayJob): void {
  const laborRevenue = job.hoursRequired * job.laborRate;
  const partsMarkup = job.kind === "warranty" ? 0.15 : 0.4;
  const partsProfit = job.partsCost * partsMarkup;
  const grossProfit = laborRevenue + partsProfit;
  postGrossProfit(d, grossProfit);

  if (job.kind === "warranty") {
    d.currentMonth.serviceGross += laborRevenue;
    d.currentMonth.partsGross += partsProfit;
    d.service.monthlyWarrantyGross += laborRevenue;
  } else {
    d.currentMonth.serviceGross += laborRevenue;
    d.currentMonth.partsGross += partsProfit;
    d.service.monthlyCustomerPayGross += laborRevenue;
  }
  d.service.monthlyPartsGross += partsProfit;
}

// Buyers drift away over time — move, switch shops, sell the car — so the
// retained base settles around a level the store's recent sales pace can
// actually support instead of climbing forever with every lifetime sale.
const SERVICE_CUSTOMER_CHURN_RATE = 0.05;

export const RETAIL_PARTS_UNIT_COST = 55;

/**
 * Run once per in-game month: restock toward target, let retention drift
 * with CSI/advisor skill, and churn the retained customer base so it
 * doesn't grow unbounded forever. `unitCost` defaults to retail price but a
 * chartered Parts Warehouse supplies the whole group cheaper — see
 * captiveLender.js's sibling, partsWarehouse.js. Returns the units actually
 * restocked this month, which the warehouse's own cycle needs to know how
 * much of its capacity the group consumed internally.
 */
export function monthlyServiceCycle(d: Dealership, unitCost: number = RETAIL_PARTS_UNIT_COST): number {
  d.serviceCustomerBase = Math.max(0, Math.round(d.serviceCustomerBase * (1 - SERVICE_CUSTOMER_CHURN_RATE)));

  const targetValue = d.service.parts.targetStockUnits * unitCost;
  const gap = targetValue - d.ledger.partsInventoryValue;
  let unitsRestocked = 0;
  if (gap > 0) {
    const spend = Math.min(gap, d.ledger.cash * 0.4);
    restockParts(d, spend);
    unitsRestocked = spend / unitCost;
  }
  d.service.parts.fillRate = Math.max(0.4, Math.min(0.97, d.service.parts.targetStockUnits / 650));

  const advisorSkill = avgSkill(d.service.advisors, 45);
  d.service.retentionRate = clamp(0.25 + (d.manufacturer.csi / 100) * 0.35 + (advisorSkill / 100) * 0.2, 0.15, 0.85);

  // CSI used to be driven almost entirely by how a sale got haggled, which
  // meant a great service department (skilled advisors/techs, well-stocked
  // parts) had no way to move the number at all — this is that missing
  // lever. Runs monthly rather than per-job since a single repair shouldn't
  // swing brand-wide satisfaction the way a single deal does.
  const techSkill = avgSkill(d.service.techs, 45);
  const serviceQuality = clamp(0.5 + ((advisorSkill - 50) / 100) * 0.4 + ((techSkill - 50) / 100) * 0.3 + (d.service.parts.fillRate - 0.7) * 0.5, 0, 1);
  d.service.csiContribution = serviceQuality * 100;
  d.manufacturer.csi = clamp(d.manufacturer.csi * 0.9 + serviceQuality * 100 * 0.1, 0, 100);

  d.service.monthlyCustomerPayGross = 0;
  d.service.monthlyWarrantyGross = 0;
  d.service.monthlyPartsGross = 0;

  return unitsRestocked;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
