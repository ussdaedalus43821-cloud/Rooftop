// ---------------------------------------------------------------------------
// Ledger bookkeeping primitives. Every balance-sheet mutation in the game
// goes through one of these functions so that Assets = Liabilities + Equity
// holds by construction rather than by hoping nothing drifts.
// ---------------------------------------------------------------------------
import type { Dealership, Vehicle } from "../types.js";

export function totalAssets(d: Dealership): number {
  return d.ledger.cash + d.ledger.vehicleInventoryValue + d.ledger.partsInventoryValue;
}

export function totalLiabilities(d: Dealership): number {
  return d.ledger.floorPlanPayable + d.ledger.accountsPayable + d.floorPlan.accruedInterestPayable;
}

export function totalEquity(d: Dealership): number {
  return d.ledger.ownerEquityContributed + d.ledger.retainedEarnings;
}

export interface InvariantCheck {
  assets: number;
  liabilities: number;
  equity: number;
  diff: number;
  balanced: boolean;
}

export function checkInvariant(d: Dealership): InvariantCheck {
  const assets = totalAssets(d);
  const liabilities = totalLiabilities(d);
  const equity = totalEquity(d);
  const diff = assets - (liabilities + equity);
  // A flat cent tolerance is right at ordinary dealership scale, but once a
  // group's balance sheet reaches into the billions/trillions (a mature
  // Manufacturer Co., an acquired real manufacturer), ordinary double-
  // precision float rounding across thousands of postings can drift past a
  // fixed $0.01 even though the books are genuinely correct — so the
  // tolerance scales with the size of the balance sheet itself, floored at
  // the original cent-level precision for small/ordinary stores.
  const tolerance = Math.max(0.01, assets * 1e-9);
  return { assets, liabilities, equity, diff, balanced: Math.abs(diff) < tolerance };
}

/** Revenue/gross-profit dollars that flow straight to cash and retained earnings. */
export function postGrossProfit(d: Dealership, amount: number): void {
  d.ledger.cash += amount;
  d.ledger.retainedEarnings += amount;
}

/** An expense paid in cash immediately. */
export function postCashExpense(d: Dealership, amount: number): void {
  d.ledger.cash -= amount;
  d.ledger.retainedEarnings -= amount;
}

/** Accrue payroll owed but not yet paid out (paid monthly). */
export function accruePayroll(d: Dealership, amount: number): void {
  d.ledger.accountsPayable += amount;
  d.ledger.retainedEarnings -= amount;
  d.currentMonth.payrollExpense += amount;
}

export function payAccruedPayroll(d: Dealership): number {
  const amt = d.ledger.accountsPayable;
  d.ledger.cash -= amt;
  d.ledger.accountsPayable = 0;
  return amt;
}

/** Floor-plan interest accrues daily as an expense; billed/paid monthly. */
export function accrueFloorPlanInterest(d: Dealership, amount: number): void {
  d.floorPlan.accruedInterestPayable += amount;
  d.ledger.retainedEarnings -= amount;
  d.currentMonth.floorPlanInterestExpense += amount;
}

export function payFloorPlanInterest(d: Dealership): number {
  const amt = d.floorPlan.accruedInterestPayable;
  d.ledger.cash -= amt;
  d.floorPlan.accruedInterestPayable = 0;
  return amt;
}

/** Cash out of a store to its owner (e.g. into the pooled group treasury) — a distribution against retained earnings, not an expense. */
export function distributeToOwner(d: Dealership, amount: number): void {
  d.ledger.cash -= amount;
  d.ledger.retainedEarnings -= amount;
}

/** Cash into a store from its owner (e.g. out of the pooled group treasury) — a capital contribution, not revenue. */
export function injectCapital(d: Dealership, amount: number): void {
  d.ledger.cash += amount;
  d.ledger.ownerEquityContributed += amount;
}

export function restockParts(d: Dealership, cost: number): void {
  d.ledger.cash -= cost;
  d.ledger.partsInventoryValue += cost;
}

/** New unit lands on the lot, fully floor-planned (the realistic default). */
export function financeAcquisition(d: Dealership, vehicle: Vehicle, cost: number): void {
  vehicle.acquisitionCost = cost;
  vehicle.floorPlanBalance = cost;
  vehicle.floorPlanOriginal = cost;
  d.ledger.vehicleInventoryValue += cost;
  d.ledger.floorPlanPayable += cost;
}

/** Recon/sublet spend is capitalized into the vehicle's cost basis. */
export function capitalizeRecon(d: Dealership, vehicle: Vehicle, cost: number): void {
  vehicle.reconCost += cost;
  d.ledger.vehicleInventoryValue += cost;
  d.ledger.cash -= cost;
}

/** Pay off a unit's floor-plan balance in full (the safe, compliant default on sale). */
export function payoffFloorPlanUnit(d: Dealership, vehicle: Vehicle): number {
  const amt = vehicle.floorPlanBalance;
  d.ledger.cash -= amt;
  d.ledger.floorPlanPayable -= amt;
  vehicle.floorPlanBalance = 0;
  return amt;
}

/** Partial paydown of a unit's floor-plan principal (a curtailment tranche). */
export function payCurtailment(d: Dealership, vehicle: Vehicle, amount: number): void {
  const amt = Math.min(amount, vehicle.floorPlanBalance);
  d.ledger.cash -= amt;
  d.ledger.floorPlanPayable -= amt;
  vehicle.floorPlanBalance -= amt;
}

/**
 * Book a vehicle sale: removes the unit's book value from inventory, adds
 * sale proceeds to cash, and recognizes the gross profit to equity.
 * Floor-plan payoff is a *separate* call (payoffFloorPlanUnit) so that
 * holding it back (sold-out-of-trust) is possible to model.
 */
export function sellVehicleBookkeeping(d: Dealership, vehicle: Vehicle, salePrice: number): number {
  const bookValue = vehicle.acquisitionCost + vehicle.reconCost;
  d.ledger.vehicleInventoryValue -= bookValue;
  d.ledger.cash += salePrice;
  const grossProfit = salePrice - bookValue;
  d.ledger.retainedEarnings += grossProfit;
  return grossProfit;
}
