import type { AllocationTier, Dealership } from "../types.js";
import { CSI_TERMINATION_THRESHOLD, QUOTA_TERMINATION_MONTHS } from "../constants.js";
import { tierMonthlyAllocationCap } from "./acquisition.js";
import { postCashExpense } from "./financials.js";

const TIER_ORDER: AllocationTier[] = ["bronze", "silver", "gold", "platinum"];

function compositeScore(d: Dealership): number {
  const attainment = d.manufacturer.quotaUnitsMonthly > 0
    ? Math.min(1.3, d.manufacturer.quotaAttainedThisMonth / d.manufacturer.quotaUnitsMonthly)
    : 1;
  return attainment * 100 * 0.45 + d.manufacturer.csi * 0.4 + d.manufacturer.facilityStandards * 0.15;
}

export function monthlyManufacturerCycle(d: Dealership, day: number): void {
  if (d.manufacturer.terminated) return;

  const score = compositeScore(d);
  const belowThreshold = score < 62 || d.manufacturer.csi < CSI_TERMINATION_THRESHOLD;

  if (belowThreshold) {
    d.manufacturer.monthsBelowThreshold += 1;
    d.manufacturer.complianceStrikes += 1;
  } else {
    d.manufacturer.monthsBelowThreshold = Math.max(0, d.manufacturer.monthsBelowThreshold - 1);
  }

  if (d.manufacturer.monthsBelowThreshold >= QUOTA_TERMINATION_MONTHS) {
    terminateFranchise(d, day);
    return;
  }

  // Tier movement: strong sustained performance earns better allocation;
  // chronic weak performance loses it — the self-reinforcing loop.
  const idx = TIER_ORDER.indexOf(d.manufacturer.tier);
  if (score >= 82 && idx < TIER_ORDER.length - 1) {
    setTier(d, TIER_ORDER[idx + 1], day);
  } else if (score < 55 && idx > 0) {
    setTier(d, TIER_ORDER[idx - 1], day);
  }

  d.manufacturer.quotaAttainedThisMonth = 0;
  d.manufacturer.allocationOrderedThisMonth = 0;
}

function setTier(d: Dealership, tier: AllocationTier, day: number): void {
  if (d.manufacturer.tier === tier) return;
  d.manufacturer.tier = tier;
  d.manufacturer.allocationCapMonthly = tierMonthlyAllocationCap(tier);
  d.manufacturer.quotaUnitsMonthly = Math.round(tierMonthlyAllocationCap(tier) * 0.7);
  d.manufacturer.tierHistory.push({ day, tier });
}

function terminateFranchise(d: Dealership, day: number): void {
  d.manufacturer.terminated = true;
  d.isUsedOnly = true;
  d.manufacturer.allocationCapMonthly = 0;
}

const FACILITY_INVESTMENT_COST = 12000;

export function investInFacilityStandards(d: Dealership): boolean {
  if (d.ledger.cash < FACILITY_INVESTMENT_COST || d.manufacturer.facilityStandards >= 100) return false;
  postCashExpense(d, FACILITY_INVESTMENT_COST);
  d.manufacturer.facilityStandards = Math.min(100, d.manufacturer.facilityStandards + 8);
  return true;
}

export function facilityInvestmentCost(): number {
  return FACILITY_INVESTMENT_COST;
}
