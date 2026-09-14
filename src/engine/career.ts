import type { Dealership, GameState, MonthlyFinancials } from "../types.js";
import { MONTHS_FOR_OWNERSHIP_OFFER, STRONG_MONTH_SCORE_THRESHOLD, getFranchiseOption } from "../constants.js";
import { createDealership, nextId } from "../state.js";
import { Rng } from "../rng.js";
import { totalAssets, totalLiabilities } from "./financials.js";

export function monthPerformanceScore(d: Dealership, month: MonthlyFinancials): number {
  const netMargin = month.netIncome / 50000; // normalize against a healthy month
  const csiScore = d.manufacturer.csi / 100;
  const complianceScore = d.manufacturer.terminated ? 0 : Math.max(0, 1 - d.manufacturer.complianceStrikes * 0.15);
  const raw = clamp(netMargin, -1, 1.4) * 55 + csiScore * 30 + complianceScore * 15;
  return clamp(raw, 0, 100);
}

export function monthlyCareerCycle(state: GameState, day: number): void {
  const d = state.dealerships[state.activeDealershipId];
  const lastMonth = d.monthlyHistory[d.monthlyHistory.length - 1];
  if (!lastMonth) return;

  const score = monthPerformanceScore(d, lastMonth);
  state.career.performanceHistory.push(score);
  state.career.monthsEmployed += 1;

  if (score >= STRONG_MONTH_SCORE_THRESHOLD) {
    state.career.consecutiveStrongMonths += 1;
    if (lastMonth.netIncome > 0) {
      state.career.bonusPoolAccrued += lastMonth.netIncome * 0.06;
    }
  } else {
    state.career.consecutiveStrongMonths = Math.max(0, state.career.consecutiveStrongMonths - 1);
  }

  if (
    state.career.role === "gm" &&
    !state.career.milestoneOfferPending &&
    !state.career.milestoneResolved &&
    state.career.consecutiveStrongMonths >= MONTHS_FOR_OWNERSHIP_OFFER
  ) {
    state.career.milestoneOfferPending = true;
    state.career.milestoneOfferDay = day;
    state.speed = 0; // pause so a big career decision never gets buried by the clock running underneath it
  }
}

export type MilestoneChoice = "equity" | "new_rooftop" | "decline";

export function resolveMilestone(state: GameState, choice: MilestoneChoice, day: number, rng: Rng): void {
  const d = state.dealerships[state.activeDealershipId];
  state.career.milestoneOfferPending = false;

  if (choice === "decline") {
    state.career.consecutiveStrongMonths = Math.max(0, MONTHS_FOR_OWNERSHIP_OFFER - 3);
    return;
  }

  state.career.milestoneResolved = true;

  if (choice === "equity") {
    const netWorth = Math.max(1, totalAssets(d) - totalLiabilities(d));
    const pct = clamp(state.career.bonusPoolAccrued / netWorth, 0.02, 0.35);
    state.career.role = "partial_owner";
    state.career.equityPct = pct;
    // The bonus pool is the GM's own accrued capital, external to store
    // cash — buying in converts it to an equity percentage, not a deposit.
    state.career.bonusPoolAccrued = 0;
  } else {
    const option = getFranchiseOption(d.manufacturer.franchiseKey);
    const capital = Math.max(option.startingCash * 0.6, state.career.bonusPoolAccrued * 3);
    const newId = nextId("dlr");
    const groupName = `${rng.pick(["Summit", "Harbor", "Crossroads", "Union", "Cascade"])} ${option.brand}`;
    const newDealership = createDealership(rng, newId, groupName, d.manufacturer.franchiseKey, day, capital);
    state.dealerships[newId] = newDealership;
    state.career.role = "owner_operator";
    state.career.equityPct = 1;
    state.career.bonusPoolAccrued = 0;
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * There's no hard win condition in Rooftop — it's a sandbox tycoon, and the
 * game keeps generating new capacity to deploy (more rooftops to buy/build,
 * a shared treasury to move around) rather than ending. These titles exist
 * so growth past any one number still has a next, named thing to reach for.
 */
export interface NetWorthTier {
  threshold: number;
  title: string;
}

export const NET_WORTH_TIERS: NetWorthTier[] = [
  { threshold: 0, title: "Startup Lot" },
  { threshold: 250_000, title: "Established Dealer" },
  { threshold: 1_000_000, title: "Regional Player" },
  { threshold: 5_000_000, title: "Multi-Store Operator" },
  { threshold: 15_000_000, title: "Auto Group Executive" },
  { threshold: 40_000_000, title: "Industry Titan" },
  { threshold: 100_000_000, title: "Automotive Empire" },
  { threshold: 250_000_000, title: "National Powerhouse" },
  { threshold: 1_000_000_000, title: "Legend of the Trade" },
];

export interface NetWorthStanding {
  tier: NetWorthTier;
  tierIndex: number;
  next: NetWorthTier | null;
  progressToNext: number; // 0-1, or 1 if at the top tier
}

/** Total wealth across everything the player owns: every dealership's own book equity, the pooled Group Treasury, and both group-level verticals' retained cash (plus the Captive Lender's outstanding loan portfolio, a real receivable). */
export function computeGroupNetWorth(state: GameState): number {
  const dealershipsEquity = Object.values(state.dealerships).reduce((sum, d) => sum + (totalAssets(d) - totalLiabilities(d)), 0);
  return dealershipsEquity
    + state.groupTreasury
    + state.captiveLender.cash + state.captiveLender.portfolioPrincipal
    + state.partsWarehouse.cash
    + state.manufacturerCo.cash
    + (state.acquiredManufacturer?.cash ?? 0);
}

export function netWorthStanding(netWorth: number): NetWorthStanding {
  let idx = 0;
  for (let i = 0; i < NET_WORTH_TIERS.length; i++) {
    if (netWorth >= NET_WORTH_TIERS[i].threshold) idx = i;
  }
  const tier = NET_WORTH_TIERS[idx];
  const next = NET_WORTH_TIERS[idx + 1] ?? null;
  const progressToNext = next ? clamp((netWorth - tier.threshold) / (next.threshold - tier.threshold), 0, 1) : 1;
  return { tier, tierIndex: idx, next, progressToNext };
}
