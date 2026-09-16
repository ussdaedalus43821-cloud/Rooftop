import type { Dealership, GameState, MonthlyFinancials } from "../types.js";
import { MONTHS_FOR_OWNERSHIP_OFFER, STRONG_MONTH_SCORE_THRESHOLD, getFranchiseOption } from "../constants.js";
import { createDealership, nextId } from "../state.js";
import { Rng } from "../rng.js";
import { distributeToOwner, totalAssets, totalLiabilities } from "./financials.js";

export function monthPerformanceScore(d: Dealership, month: MonthlyFinancials): number {
  const netMargin = month.netIncome / 50000; // normalize against a healthy month
  const csiScore = d.manufacturer.csi / 100;
  const complianceScore = d.manufacturer.terminated ? 0 : Math.max(0, 1 - d.manufacturer.complianceStrikes * 0.15);
  const raw = clamp(netMargin, -1, 1.4) * 55 + csiScore * 30 + complianceScore * 15;
  return clamp(raw, 0, 100);
}

export function monthlyCareerCycle(state: GameState, day: number): void {
  const c = state.career;

  // A full 100% owner already bought out everything there was to buy —
  // nothing left to offer, no bonus pool worth accruing toward it.
  if (c.role === "owner_operator") return;

  // Pre-milestone, the player's only store IS whatever's active — that's
  // guaranteed, since expansion is locked behind having already become an
  // owner. Post-equity, though, the player may have gone on to build or
  // buy other stores and be looking at one of those instead: performance
  // has to keep tracking the specific store the stake is actually in, not
  // whichever tab happens to be open.
  const dealershipId = c.role === "gm" ? state.activeDealershipId : c.equityDealershipId;
  if (!dealershipId) return;
  const d = state.dealerships[dealershipId];
  if (!d) return; // the equity store is gone (sold, or lost to a takeover) — nothing left to track
  const lastMonth = d.monthlyHistory[d.monthlyHistory.length - 1];
  if (!lastMonth) return;

  const score = monthPerformanceScore(d, lastMonth);
  c.performanceHistory.push(score);
  c.monthsEmployed += 1;

  if (score >= STRONG_MONTH_SCORE_THRESHOLD) {
    c.consecutiveStrongMonths += 1;
    if (lastMonth.netIncome > 0) {
      c.bonusPoolAccrued += lastMonth.netIncome * 0.06;
    }
  } else {
    c.consecutiveStrongMonths = Math.max(0, c.consecutiveStrongMonths - 1);
  }

  // The very first offer is the three-way fork (equity / found your own /
  // decline) and only fires once. Every offer after that — once already a
  // partial owner, still short of 100% — is a repeatable "buy more" ask,
  // not gated by milestoneResolved, so a sustained run of strong months
  // keeps opening the door to climb further toward full ownership.
  const eligible =
    !c.milestoneOfferPending &&
    c.consecutiveStrongMonths >= MONTHS_FOR_OWNERSHIP_OFFER &&
    (c.role === "gm" ? !c.milestoneResolved : c.equityPct < 1);

  if (eligible) {
    c.milestoneOfferPending = true;
    c.milestoneOfferDay = day;
    state.speed = 0; // pause so a big career decision never gets buried by the clock running underneath it
  }
}

/**
 * A minority stake means real ownership, not a label: each month, whatever
 * the store didn't pay out in expenses/tax still mostly belongs to the
 * business itself (an outside majority owner, in the fiction) — except the
 * player's own slice, which gets paid out to them in cash, same as a real
 * minority shareholder's dividend. Without this, "14% owner" would just be
 * a number that never put a dollar in the player's pocket.
 */
export function payOwnerDistribution(state: GameState, d: Dealership): number {
  const c = state.career;
  if (c.role !== "partial_owner" || c.equityDealershipId !== d.id) return 0;
  const netIncome = d.currentMonth.netIncome;
  if (netIncome <= 0) return 0;
  const amount = Math.min(netIncome * c.equityPct, d.ledger.cash);
  if (amount <= 0) return 0;
  distributeToOwner(d, amount);
  state.groupTreasury += amount;
  c.lifetimeDistributions += amount;
  return amount;
}

export type MilestoneChoice = "equity" | "new_rooftop" | "decline";

export function resolveMilestone(state: GameState, choice: MilestoneChoice, day: number, rng: Rng, newRooftopName?: string): void {
  state.career.milestoneOfferPending = false;

  if (choice === "decline") {
    state.career.consecutiveStrongMonths = Math.max(0, MONTHS_FOR_OWNERSHIP_OFFER - 3);
    return;
  }

  state.career.milestoneResolved = true;
  // A sustained streak that's already well past the threshold (e.g. a
  // store that's been strong for years) would otherwise stay eligible
  // every single month after the first offer — consecutiveStrongMonths
  // never dropped below the gate, so accepting would immediately re-open
  // it next month instead of requiring another genuine 6-month run.
  // Reset it here so every repeat buy-in re-earns its own streak.
  state.career.consecutiveStrongMonths = 0;

  if (choice === "equity") {
    // The first buy-in and every later top-up target the same store — set
    // once here and reused from then on, regardless of which store the
    // player is currently viewing.
    const targetId = state.career.equityDealershipId ?? state.activeDealershipId;
    const d = state.dealerships[targetId];
    if (!d) return; // the store this stake was in is gone — nothing left to buy into
    const netWorth = Math.max(1, totalAssets(d) - totalLiabilities(d));
    const additionalPct = clamp(state.career.bonusPoolAccrued / netWorth, 0.02, 0.35);
    const newPct = Math.min(1, state.career.equityPct + additionalPct);
    state.career.equityDealershipId = d.id;
    state.career.equityPct = newPct;
    // Bought all the way out — you're not a minority partner anymore, you
    // own the place outright, same as founding one from scratch would.
    state.career.role = newPct >= 1 ? "owner_operator" : "partial_owner";
    // The bonus pool is the GM's own accrued capital, external to store
    // cash — buying in converts it to equity, not a deposit.
    state.career.bonusPoolAccrued = 0;
  } else {
    const d = state.dealerships[state.activeDealershipId];
    const option = getFranchiseOption(d.manufacturer.franchiseKey);
    const capital = Math.max(option.startingCash * 0.6, state.career.bonusPoolAccrued * 3);
    const newId = nextId("dlr");
    const groupName = newRooftopName?.trim() || `${rng.pick(["Summit", "Harbor", "Crossroads", "Union", "Cascade"])} ${option.brand}`;
    const newDealership = createDealership(rng, newId, groupName, d.manufacturer.franchiseKey, day, capital);
    state.dealerships[newId] = newDealership;

    // This isn't buying a second location — it's quitting a salaried GM
    // job to start your own. You never held equity in the store you were
    // managing, so it doesn't come with you: it stays behind (no payout —
    // you were never its owner) and your only store from here on is the
    // one you just founded. Any later multi-store growth comes from
    // actually buying/building rooftops with your own money, not a leftover
    // freebie from this milestone.
    delete state.dealerships[d.id];
    state.activeDealershipId = newId;

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
