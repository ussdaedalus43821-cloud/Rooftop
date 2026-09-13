import type { Dealership, GameState } from "../types.js";
import { Rng } from "../rng.js";
import { isNewMonth, monthLabel } from "./clock.js";
import { tickInventoryDaily } from "./inventory.js";
import { generateDailyServiceJobs, monthlyServiceCycle, processServiceJobs } from "./service.js";
import { autoNegotiateDeal, dailyUpCount, tryCreateUp } from "./salesFloor.js";
import { autoRunFi } from "./fi.js";
import { monthlyManufacturerCycle } from "./manufacturer.js";
import { monthlyCareerCycle } from "./career.js";
import {
  accruePayroll,
  payAccruedPayroll,
  payFloorPlanInterest,
  postCashExpense,
} from "./financials.js";
import { OVERHEAD_MONTHLY } from "../constants.js";

const MAX_TOASTS = 30;
const STALE_NEGOTIATION_DAYS = 3;

export function pushToast(state: GameState, text: string, kind: "good" | "bad" | "warn" | "info" = "info"): void {
  state.toasts.push({
    id: `${state.day}_${Math.random().toString(36).slice(2, 7)}`,
    text,
    kind,
    day: state.day,
  });
  if (state.toasts.length > MAX_TOASTS) state.toasts.splice(0, state.toasts.length - MAX_TOASTS);
}

function accruePayrollDaily(d: Dealership): void {
  const dailyTotal = d.staff.reduce((sum, s) => sum + s.monthlySalary / 30, 0);
  accruePayroll(d, dailyTotal);
}

function tickDealershipDay(state: GameState, d: Dealership, rng: Rng): void {
  if (d.failure) return;

  accruePayrollDaily(d);
  tickInventoryDaily(d, state.day, rng);
  generateDailyServiceJobs(d, state.day, rng);
  processServiceJobs(d, state.day, rng);

  const ups = dailyUpCount(d, rng);
  for (let i = 0; i < ups; i++) {
    tryCreateUp(d, state.day, rng);
  }

  if (d.autoPilot.sales) {
    for (const deal of d.deals) {
      if (deal.stage !== "negotiating") continue;
      const vehicle = d.vehicles.find((v) => v.id === deal.vehicleId);
      if (!vehicle) continue;
      const outcome = autoNegotiateDeal(d, deal, vehicle, rng);
      const repName = d.staff.find((s) => s.id === deal.salespersonId)?.name ?? "your rep";
      if (outcome?.outcome === "accept") {
        pushToast(state, `${repName} closed ${deal.customer.name} at $${Math.round(deal.terms.price).toLocaleString()}.`, "good");
      } else if (outcome?.outcome === "walk") {
        pushToast(state, `${deal.customer.name} walked away from ${repName}.`, "warn");
      }
    }
  }

  if (d.autoPilot.fi) {
    for (const deal of d.deals) {
      if (deal.stage !== "agreed" && deal.stage !== "fi") continue;
      const vehicle = d.vehicles.find((v) => v.id === deal.vehicleId);
      if (!vehicle) continue;
      autoRunFi(d, deal, vehicle, state.day, rng);
      pushToast(state, `F&I closed ${deal.customer.name}'s deal. Total gross $${Math.round(deal.frontEndGross + deal.fiGross).toLocaleString()}.`, "good");
    }
  }

  for (const deal of d.deals) {
    if (deal.stage === "negotiating" && state.day - deal.createdDay > STALE_NEGOTIATION_DAYS) {
      deal.stage = "lost";
      deal.log.push(`${deal.customer.name} lost interest and left.`);
    }
  }
  d.deals = d.deals.filter((deal) => !(
    (deal.stage === "closed" || deal.stage === "lost") && state.day - deal.createdDay > 14
  ));

  if (d.failure) {
    pushToast(state, `${d.name}: the floor-plan lender has swept unpaid inventory. The line is pulled.`, "bad");
  }
}

function finalizeMonth(state: GameState, d: Dealership): void {
  const overhead = OVERHEAD_MONTHLY;
  postCashExpense(d, overhead);
  d.currentMonth.overheadExpense = overhead;

  payAccruedPayroll(d);
  payFloorPlanInterest(d);

  d.currentMonth.totalGrossProfit =
    d.currentMonth.frontEndGross + d.currentMonth.fiGross + d.currentMonth.serviceGross + d.currentMonth.partsGross;
  d.currentMonth.netIncome =
    d.currentMonth.totalGrossProfit -
    d.currentMonth.payrollExpense -
    d.currentMonth.floorPlanInterestExpense -
    d.currentMonth.overheadExpense -
    d.currentMonth.curtailmentPenalties;
  d.currentMonth.csiAvgScore = d.manufacturer.csi;

  d.monthlyHistory.push(d.currentMonth);
  if (d.monthlyHistory.length > 36) d.monthlyHistory.shift();

  monthlyManufacturerCycle(d, state.day);
  monthlyServiceCycle(d);

  d.currentMonth = {
    monthLabel: monthLabel(state.day),
    frontEndGross: 0,
    fiGross: 0,
    serviceGross: 0,
    partsGross: 0,
    totalGrossProfit: 0,
    payrollExpense: 0,
    floorPlanInterestExpense: 0,
    overheadExpense: 0,
    curtailmentPenalties: 0,
    netIncome: 0,
    unitsSoldNew: 0,
    unitsSoldUsed: 0,
    csiAvgScore: d.manufacturer.csi,
  };
}

export function advanceOneDay(state: GameState, rng: Rng): void {
  state.day += 1;

  for (const id of Object.keys(state.dealerships)) {
    tickDealershipDay(state, state.dealerships[id], rng);
  }

  if (isNewMonth(state.day)) {
    for (const id of Object.keys(state.dealerships)) {
      const d = state.dealerships[id];
      finalizeMonth(state, d);
      const justFinalized = d.monthlyHistory[d.monthlyHistory.length - 1];
      pushToast(
        state,
        `${d.name} — ${justFinalized.monthLabel}: net ${justFinalized.netIncome >= 0 ? "profit" : "loss"} of $${Math.abs(Math.round(justFinalized.netIncome)).toLocaleString()}.`,
        justFinalized.netIncome >= 0 ? "good" : "warn",
      );
    }
    monthlyCareerCycle(state, state.day);
    if (state.career.milestoneOfferPending) {
      pushToast(state, "A real opportunity has come up — check your Career milestone.", "good");
    }
  }

  state.rngState = rng.getState();
}
