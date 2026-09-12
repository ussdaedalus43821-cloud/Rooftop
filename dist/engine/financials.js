export function totalAssets(d) {
    return d.ledger.cash + d.ledger.vehicleInventoryValue + d.ledger.partsInventoryValue;
}
export function totalLiabilities(d) {
    return d.ledger.floorPlanPayable + d.ledger.accountsPayable + d.floorPlan.accruedInterestPayable;
}
export function totalEquity(d) {
    return d.ledger.ownerEquityContributed + d.ledger.retainedEarnings;
}
export function checkInvariant(d) {
    const assets = totalAssets(d);
    const liabilities = totalLiabilities(d);
    const equity = totalEquity(d);
    const diff = assets - (liabilities + equity);
    return { assets, liabilities, equity, diff, balanced: Math.abs(diff) < 0.01 };
}
/** Revenue/gross-profit dollars that flow straight to cash and retained earnings. */
export function postGrossProfit(d, amount) {
    d.ledger.cash += amount;
    d.ledger.retainedEarnings += amount;
}
/** An expense paid in cash immediately. */
export function postCashExpense(d, amount) {
    d.ledger.cash -= amount;
    d.ledger.retainedEarnings -= amount;
}
/** Accrue payroll owed but not yet paid out (paid monthly). */
export function accruePayroll(d, amount) {
    d.ledger.accountsPayable += amount;
    d.ledger.retainedEarnings -= amount;
    d.currentMonth.payrollExpense += amount;
}
export function payAccruedPayroll(d) {
    const amt = d.ledger.accountsPayable;
    d.ledger.cash -= amt;
    d.ledger.accountsPayable = 0;
    return amt;
}
/** Floor-plan interest accrues daily as an expense; billed/paid monthly. */
export function accrueFloorPlanInterest(d, amount) {
    d.floorPlan.accruedInterestPayable += amount;
    d.ledger.retainedEarnings -= amount;
    d.currentMonth.floorPlanInterestExpense += amount;
}
export function payFloorPlanInterest(d) {
    const amt = d.floorPlan.accruedInterestPayable;
    d.ledger.cash -= amt;
    d.floorPlan.accruedInterestPayable = 0;
    return amt;
}
export function restockParts(d, cost) {
    d.ledger.cash -= cost;
    d.ledger.partsInventoryValue += cost;
}
/** New unit lands on the lot, fully floor-planned (the realistic default). */
export function financeAcquisition(d, vehicle, cost) {
    vehicle.acquisitionCost = cost;
    vehicle.floorPlanBalance = cost;
    vehicle.floorPlanOriginal = cost;
    d.ledger.vehicleInventoryValue += cost;
    d.ledger.floorPlanPayable += cost;
}
/** Recon/sublet spend is capitalized into the vehicle's cost basis. */
export function capitalizeRecon(d, vehicle, cost) {
    vehicle.reconCost += cost;
    d.ledger.vehicleInventoryValue += cost;
    d.ledger.cash -= cost;
}
/** Pay off a unit's floor-plan balance in full (the safe, compliant default on sale). */
export function payoffFloorPlanUnit(d, vehicle) {
    const amt = vehicle.floorPlanBalance;
    d.ledger.cash -= amt;
    d.ledger.floorPlanPayable -= amt;
    vehicle.floorPlanBalance = 0;
    return amt;
}
/** Partial paydown of a unit's floor-plan principal (a curtailment tranche). */
export function payCurtailment(d, vehicle, amount) {
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
export function sellVehicleBookkeeping(d, vehicle, salePrice) {
    const bookValue = vehicle.acquisitionCost + vehicle.reconCost;
    d.ledger.vehicleInventoryValue -= bookValue;
    d.ledger.cash += salePrice;
    const grossProfit = salePrice - bookValue;
    d.ledger.retainedEarnings += grossProfit;
    return grossProfit;
}
//# sourceMappingURL=financials.js.map