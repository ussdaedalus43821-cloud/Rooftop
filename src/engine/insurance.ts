// ---------------------------------------------------------------------------
// Garage policy — a bundled garage liability + physical damage +
// garagekeepers policy, the way most small/mid dealers actually buy
// coverage (one package, not separate line items). Per dealership, since
// premium is driven by that store's own inventory value and headcount, not
// anything group-level.
//
// Nothing in the engine files a claim yet — random events (test-drive
// wrecks, hail, theft, service-bay mishaps) are the next piece and will
// call fileInsuranceClaim once they exist. This module is a complete,
// independently testable system in the meantime: choose a tier and
// deductible, pay a real monthly premium, and — the actual teeth — a
// floor-plan lender expects its financed collateral to stay insured, so
// running uninsured while carrying floor-plan debt past a grace period
// feeds the same violationSeverity/audit-failure consequence a missed
// curtailment does (see engine/inventory.ts).
// ---------------------------------------------------------------------------
import type { Dealership, InsuranceState, InsuranceTier } from "../types.js";
import { postCashExpense, postGrossProfit } from "./financials.js";

const TIER_BASE_RATE: Record<InsuranceTier, number> = {
  none: 0,
  basic: 0.0015, // ~0.15%/mo of insurable exposure
  standard: 0.0028,
  premium: 0.0045,
};

const TIER_MIN_PREMIUM: Record<InsuranceTier, number> = {
  none: 0,
  basic: 150,
  standard: 300,
  premium: 550,
};

// Workers'-comp-equivalent exposure added per staff member, on top of the
// store's own vehicle inventory value (the physical-damage/garage-liability
// side of the exposure).
const STAFF_EXPOSURE_PER_HEAD = 15_000;

export const DEDUCTIBLE_OPTIONS = [500, 1000, 2500, 5000, 10_000];
const DEFAULT_DEDUCTIBLE = 1000;

// Choosing a lower deductible costs more (less risk retained); a higher one
// discounts the rate. Anchored at 1.0x on the $1,000 default.
const DEDUCTIBLE_RATE_FACTOR: Record<number, number> = {
  500: 1.15,
  1000: 1.0,
  2500: 0.85,
  5000: 0.72,
  10_000: 0.6,
};

// How far back a paid claim still counts against this month's rate — real
// experience rating typically looks at a trailing 1-3 year window; a year
// keeps a bad month from haunting a save indefinitely.
const CLAIM_LOOKBACK_DAYS = 365;
// Caps how much a bad claims run can multiply the base rate — real
// experience rating has a ceiling too, not literal bankruptcy-by-premium.
const MAX_EXPERIENCE_SURCHARGE = 1.0;

// A brand-new save starts uninsured by default — punishing that immediately
// would blindside a player who hasn't found this tab yet. Only a store that
// keeps carrying floor-plan debt while staying uninsured for a genuinely
// long stretch draws the lender's attention.
const UNINSURED_GRACE_MONTHS = 6;
const UNINSURED_VIOLATION_PER_MONTH = 1.5;

export function newInsuranceState(): InsuranceState {
  return {
    tier: "none",
    deductible: DEFAULT_DEDUCTIBLE,
    monthlyPremium: 0,
    lifetimePremiumsPaid: 0,
    lifetimeClaimsPaid: 0,
    monthsUninsuredStreak: 0,
    recentClaims: [],
  };
}

export function insurableExposure(d: Dealership): number {
  return d.ledger.vehicleInventoryValue + d.staff.length * STAFF_EXPOSURE_PER_HEAD;
}

function recentClaimsPayout(d: Dealership, day: number): number {
  return d.insurance.recentClaims.filter((c) => day - c.day <= CLAIM_LOOKBACK_DAYS).reduce((sum, c) => sum + c.payout, 0);
}

/** The premium for an arbitrary tier/deductible choice, independent of what's actually on the policy right now — lets the tab preview a change before committing. */
export function computePremiumFor(d: Dealership, day: number, tier: InsuranceTier, deductible: number): number {
  if (tier === "none") return 0;
  const exposure = insurableExposure(d);
  const deductibleFactor = DEDUCTIBLE_RATE_FACTOR[deductible] ?? 1.0;
  const claimsPayout = recentClaimsPayout(d, day);
  const experienceMult = 1 + Math.min(MAX_EXPERIENCE_SURCHARGE, claimsPayout / Math.max(50_000, exposure * 0.5));
  const raw = exposure * TIER_BASE_RATE[tier] * deductibleFactor * experienceMult;
  return Math.round(Math.max(TIER_MIN_PREMIUM[tier], raw));
}

/** What this store's premium would be right now, at its current tier/deductible — used both to actually charge it monthly and as the tab's baseline before previewing a change. */
export function computeMonthlyPremium(d: Dealership, day: number): number {
  return computePremiumFor(d, day, d.insurance.tier, d.insurance.deductible);
}

export function setInsuranceTier(d: Dealership, tier: InsuranceTier): void {
  d.insurance.tier = tier;
}

export function setInsuranceDeductible(d: Dealership, deductible: number): boolean {
  if (!DEDUCTIBLE_OPTIONS.includes(deductible)) return false;
  d.insurance.deductible = deductible;
  return true;
}

/**
 * Run once per in-game month, from finalizeMonth. Recomputes and charges
 * the premium, and — the actual compliance lever — advances (or resets)
 * the uninsured-while-financed streak against the floor-plan lender's own
 * violationSeverity score, the same score a missed curtailment feeds (see
 * engine/inventory.ts's triggerFloorPlanAudit). Returns the premium charged,
 * for the month's P&L.
 */
export function monthlyInsuranceCycle(d: Dealership, day: number): number {
  const premium = computeMonthlyPremium(d, day);
  d.insurance.monthlyPremium = premium;
  if (premium > 0) {
    postCashExpense(d, premium);
    d.insurance.lifetimePremiumsPaid += premium;
  }

  if (d.insurance.tier === "none" && d.ledger.floorPlanPayable > 0) {
    d.insurance.monthsUninsuredStreak += 1;
    if (d.insurance.monthsUninsuredStreak > UNINSURED_GRACE_MONTHS) {
      d.floorPlan.violationSeverity += UNINSURED_VIOLATION_PER_MONTH;
    }
  } else {
    d.insurance.monthsUninsuredStreak = 0;
  }

  return premium;
}

/** Call after a loss occurs (a random event, once those exist) — books the insurer's payout as an offsetting recovery. The event itself is responsible for booking the underlying loss; this only books what comes back. Returns 0 with no payout if uninsured — the store eats the whole loss. */
export function fileInsuranceClaim(d: Dealership, day: number, cause: string, lossAmount: number): { payout: number; deductiblePaid: number } {
  if (d.insurance.tier === "none" || lossAmount <= 0) {
    return { payout: 0, deductiblePaid: Math.max(0, lossAmount) };
  }
  const payout = Math.max(0, lossAmount - d.insurance.deductible);
  if (payout > 0) {
    postGrossProfit(d, payout);
    d.insurance.lifetimeClaimsPaid += payout;
  }
  d.insurance.recentClaims.push({ day, cause, lossAmount, payout });
  if (d.insurance.recentClaims.length > 24) d.insurance.recentClaims.shift();
  return { payout, deductiblePaid: Math.min(lossAmount, d.insurance.deductible) };
}
