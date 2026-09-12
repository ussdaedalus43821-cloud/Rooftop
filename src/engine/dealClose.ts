import type { Deal, Dealership, Vehicle } from "../types.js";
import { createTradeInVehicle } from "./acquisition.js";
import { payoffFloorPlanUnit, postCashExpense, sellVehicleBookkeeping } from "./financials.js";
import { Rng } from "../rng.js";

/**
 * Finalizes a sale after F&I: books the vehicle sale, pays (or, if the
 * floor-plan emergency lever is on, defers) the floor-plan payoff, spins up
 * the trade-in as new inventory, pays sales commission, and folds the deal's
 * numbers into this month's P&L and reputation/CSI trackers.
 */
export function closeDeal(d: Dealership, deal: Deal, vehicle: Vehicle, day: number, rng: Rng): void {
  const grossProfit = sellVehicleBookkeeping(d, vehicle, deal.terms.price);
  deal.frontEndGross = grossProfit;
  vehicle.stage = "sold";

  if (d.floorPlan.holdPayoffs) {
    // Cash stays in the till a while longer, but the unit's collateral is
    // gone — this is exactly the sold-out-of-trust exposure the lender
    // audits for.
  } else {
    payoffFloorPlanUnit(d, vehicle);
  }

  if (deal.customer.hasTrade && deal.customer.tradeVehicle && deal.terms.tradeAllowance > 0) {
    const trade = deal.customer.tradeVehicle;
    const tradeModel: Vehicle["model"] = {
      name: trade.modelName,
      trim: "Trade-In",
      class: trade.class,
      msrp: trade.marketValue,
      invoice: trade.marketValue,
      desirability: 0.5,
    };
    const estimatedOdometer = Math.round((2024 - trade.year) * 12000 + rng.range(-8000, 8000));
    createTradeInVehicle(d, tradeModel, Math.max(2000, estimatedOdometer), deal.terms.tradeAllowance, day, rng);
  }

  const rep = d.staff.find((s) => s.id === deal.salespersonId);
  if (rep) {
    const commission = Math.max(0, grossProfit) * (rep.commissionRate ?? 0.2);
    postCashExpense(d, commission);
    rep.dealsThisMonth += 1;
    rep.grossThisMonth += grossProfit;
  }

  d.currentMonth.frontEndGross += grossProfit;
  d.currentMonth.fiGross += deal.fiGross;
  if (vehicle.condition === "new") d.currentMonth.unitsSoldNew += 1;
  else d.currentMonth.unitsSoldUsed += 1;
  d.manufacturer.quotaAttainedThisMonth += vehicle.condition === "new" ? 1 : 0;

  const dealSatisfaction = clamp01(0.5 + deal.lastCustomerMood * 0.25);
  d.manufacturer.csi = clamp(d.manufacturer.csi * 0.94 + dealSatisfaction * 100 * 0.06, 0, 100);
  d.reputation = clamp(d.reputation + (dealSatisfaction - 0.5) * 4, 0, 100);
  d.serviceCustomerBase += 1;

  deal.stage = "closed";
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
function clamp01(v: number): number {
  return clamp(v, 0, 1);
}
