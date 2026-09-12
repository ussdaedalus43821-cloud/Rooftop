import { AUDIT_FAIL_SEVERITY } from "../constants.js";
import { accrueFloorPlanInterest, capitalizeRecon, payCurtailment, payoffFloorPlanUnit, } from "./financials.js";
const NEW_PREP_DAYS = 2;
export function getCurtailmentTiersOwed(vehicle, thresholdDays, intervalDays) {
    if (vehicle.daysInInventory < thresholdDays)
        return 0;
    return 1 + Math.floor((vehicle.daysInInventory - thresholdDays) / intervalDays);
}
export function getCurtailmentDue(vehicle, d) {
    const owedTiers = getCurtailmentTiersOwed(vehicle, d.floorPlan.curtailmentThresholdDays, d.floorPlan.curtailmentIntervalDays);
    const unpaidTiers = Math.max(0, owedTiers - vehicle.curtailmentPaidTiers);
    if (unpaidTiers <= 0)
        return 0;
    const perTranche = vehicle.floorPlanOriginal * d.floorPlan.curtailmentFraction;
    return Math.min(unpaidTiers * perTranche, vehicle.floorPlanBalance);
}
export function payVehicleCurtailmentInFull(d, vehicle) {
    const due = getCurtailmentDue(vehicle, d);
    if (due <= 0)
        return 0;
    payCurtailment(d, vehicle, due);
    const owedTiers = getCurtailmentTiersOwed(vehicle, d.floorPlan.curtailmentThresholdDays, d.floorPlan.curtailmentIntervalDays);
    vehicle.curtailmentPaidTiers = owedTiers;
    vehicle.curtailmentDueSinceDay = 0;
    return due;
}
export function payOffHeldUnit(d, vehicleId) {
    const v = d.vehicles.find((x) => x.id === vehicleId);
    if (!v || v.stage !== "sold" || v.floorPlanBalance <= 0)
        return;
    payoffFloorPlanUnit(d, v);
    v.soldOutOfTrustDays = 0;
    d.vehicles = d.vehicles.filter((x) => x.id !== vehicleId);
}
function reconRequirementsFor(vehicle, rng) {
    if (vehicle.condition === "new")
        return { cost: 0, days: 0 };
    const conditionFactor = 1 - Math.min(1, vehicle.odometer / 150000);
    const baseCost = rng.range(400, 2600) * (1.4 - conditionFactor);
    const days = Math.max(1, Math.round(rng.range(2, 6) * (1.4 - conditionFactor)));
    return { cost: Math.round(baseCost), days };
}
/** Advances every vehicle one day: recon pipeline, floor-plan interest, curtailment, SOT. */
export function tickInventoryDaily(d, day, rng) {
    for (const v of d.vehicles) {
        if (v.stage === "sold") {
            v.soldOutOfTrustDays += 1;
            if (v.floorPlanBalance > 0) {
                accrueFloorPlanInterest(d, v.floorPlanBalance * d.floorPlan.dailyRate);
                if (v.soldOutOfTrustDays > 3) {
                    // Every day past a short grace window that a sold unit's floor-plan
                    // balance sits unpaid is a live sold-out-of-trust exposure.
                    d.floorPlan.violationSeverity += 1.5;
                }
            }
            continue;
        }
        v.daysInStage += 1;
        v.daysInInventory += 1;
        if (v.floorPlanBalance > 0) {
            accrueFloorPlanInterest(d, v.floorPlanBalance * d.floorPlan.dailyRate);
        }
        // Curtailment grace-period violation tracking.
        const due = getCurtailmentDue(v, d);
        if (due > 0) {
            if (v.curtailmentDueSinceDay === 0)
                v.curtailmentDueSinceDay = day;
            const overdue = day - v.curtailmentDueSinceDay;
            if (overdue > d.floorPlan.curtailmentGraceDays) {
                d.floorPlan.violationSeverity += 0.8;
            }
        }
        else {
            v.curtailmentDueSinceDay = 0;
        }
        // Recon pipeline progression.
        if (v.stage === "acquired") {
            const prepDays = v.condition === "new" ? NEW_PREP_DAYS : 1;
            if (v.daysInStage >= prepDays) {
                v.stage = "inspected";
                v.daysInStage = 0;
                const req = reconRequirementsFor(v, rng);
                v.reconCostEstimate = req.cost;
                v.reconDaysRequired = req.days;
            }
        }
        else if (v.stage === "inspected") {
            if (v.reconDaysRequired <= 0) {
                v.stage = "ready";
                v.daysInStage = 0;
            }
            else {
                v.stage = "reconditioning";
                v.daysInStage = 0;
            }
        }
        else if (v.stage === "reconditioning") {
            if (v.reconDaysRequired > 0) {
                const perDaySpend = v.reconCostEstimate / v.reconDaysRequired;
                capitalizeRecon(d, v, perDaySpend);
            }
            if (v.daysInStage >= v.reconDaysRequired) {
                v.stage = "ready";
                v.daysInStage = 0;
            }
        }
        else if (v.stage === "ready") {
            v.listPrice = defaultListPrice(v);
            v.stage = "listed";
            v.daysInStage = 0;
        }
    }
    // Purge fully paid-off, sold units.
    d.vehicles = d.vehicles.filter((v) => !(v.stage === "sold" && v.floorPlanBalance <= 0));
    if (d.floorPlan.violationSeverity >= AUDIT_FAIL_SEVERITY && !d.floorPlan.auditFailed) {
        triggerFloorPlanAudit(d);
    }
}
function defaultListPrice(v) {
    if (v.condition === "new")
        return v.model.msrp;
    const bookValue = v.acquisitionCost + v.reconCost;
    return Math.round(bookValue * 1.18);
}
/** The floor-plan lender sweeps aged/unaccounted inventory: a genuine failure path. */
function triggerFloorPlanAudit(d) {
    d.floorPlan.auditFailed = true;
    d.failure = "floorplan_seized";
}
export function inventoryBookValue(d) {
    return d.vehicles.reduce((sum, v) => sum + (v.stage === "sold" ? 0 : v.acquisitionCost + v.reconCost), 0);
}
export function unitsOnLot(d) {
    return d.vehicles.filter((v) => v.stage === "listed");
}
//# sourceMappingURL=inventory.js.map