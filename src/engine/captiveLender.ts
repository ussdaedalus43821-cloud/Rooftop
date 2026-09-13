// ---------------------------------------------------------------------------
// Captive Lender — a group-level finance company you can charter once you're
// an owner. Every deal financed anywhere in your group (not just the store
// you're viewing) originates a loan on the captive lender's books instead of
// that interest income just evaporating to an unmodeled outside bank, the
// way it does before you charter one. Tracked as one aggregate portfolio
// (total principal + a blended APR) rather than a per-loan ledger, so the
// save file can't grow unbounded the way the old service-job backlog did.
// ---------------------------------------------------------------------------
import type { CaptiveLenderState, Deal, GameState } from "../types.js";
import { postCashExpense } from "./financials.js";

const CHARTER_COST = 750_000;
const MONTHLY_AMORTIZATION_RATE = 0.021; // principal runoff from scheduled paydown/trade-ins/refis, ~4yr average payoff
const MIN_DEFAULT_RATE = 0.0005; // ~0.6%/yr, a prime-heavy book
const MAX_DEFAULT_RATE = 0.006; // ~7%/yr, a deeply subprime-heavy book

export function newCaptiveLender(): CaptiveLenderState {
  return {
    chartered: false,
    charterDay: -1,
    cash: 0,
    portfolioPrincipal: 0,
    weightedApr: 0,
    originationsThisMonth: 0,
    lastMonthOriginations: 0,
    lastMonthInterestIncome: 0,
    lastMonthChargeOffs: 0,
    lifetimeInterestIncome: 0,
    lifetimeChargeOffs: 0,
    lifetimeOriginationVolume: 0,
  };
}

export function charterCaptiveLenderCost(): number {
  return CHARTER_COST;
}

export interface CharterResult {
  ok: boolean;
  reason?: string;
}

export type CaptiveLenderFunding = "active" | "treasury";

export function charterCaptiveLender(state: GameState, funding: CaptiveLenderFunding, payerDealershipId: string): CharterResult {
  if (state.career.role === "gm") return { ok: false, reason: "Become an owner before chartering a captive finance company." };
  if (state.captiveLender.chartered) return { ok: false, reason: "Already chartered." };

  if (funding === "treasury") {
    if (state.groupTreasury < CHARTER_COST) return { ok: false, reason: "Not enough in the group treasury." };
    state.groupTreasury -= CHARTER_COST;
  } else {
    const payer = state.dealerships[payerDealershipId];
    if (!payer) return { ok: false, reason: "Dealership not found." };
    if (payer.ledger.cash < CHARTER_COST) return { ok: false, reason: "Not enough cash on hand." };
    postCashExpense(payer, CHARTER_COST);
  }

  state.captiveLender.chartered = true;
  state.captiveLender.charterDay = state.day;
  return { ok: true };
}

/** Called whenever a deal closes anywhere in the group — folds the amount financed into the captive lender's portfolio at that deal's buy-rate APR. A no-op until chartered. */
export function originateCaptiveLoan(state: GameState, deal: Deal): void {
  const lender = state.captiveLender;
  if (!lender.chartered) return;
  const amountFinanced = Math.max(0, deal.terms.price - deal.terms.tradeAllowance - deal.terms.downPayment);
  if (amountFinanced <= 0) return;

  const newPrincipal = lender.portfolioPrincipal + amountFinanced;
  lender.weightedApr = (lender.weightedApr * lender.portfolioPrincipal + deal.terms.aprBuyRate * amountFinanced) / newPrincipal;
  lender.portfolioPrincipal = newPrincipal;
  lender.originationsThisMonth += amountFinanced;
  lender.lifetimeOriginationVolume += amountFinanced;
}

/** Monthly interest income, principal runoff, and default charge-offs on the aggregate portfolio. A no-op until chartered. Returns the interest income earned this cycle, for a toast. */
export function monthlyCaptiveLenderCycle(state: GameState): number {
  const lender = state.captiveLender;
  lender.lastMonthOriginations = lender.originationsThisMonth;
  lender.originationsThisMonth = 0;

  if (!lender.chartered || lender.portfolioPrincipal <= 0) {
    lender.lastMonthInterestIncome = 0;
    lender.lastMonthChargeOffs = 0;
    return 0;
  }

  const interestIncome = lender.portfolioPrincipal * (lender.weightedApr / 12);
  // Higher blended APR implies a riskier (more subprime-heavy) book, so it also carries more default risk.
  const defaultRate = clamp((lender.weightedApr - 0.04) * 0.04, MIN_DEFAULT_RATE, MAX_DEFAULT_RATE);
  const chargeOffs = lender.portfolioPrincipal * defaultRate;
  const runoff = lender.portfolioPrincipal * MONTHLY_AMORTIZATION_RATE;

  lender.cash += interestIncome;
  lender.portfolioPrincipal = Math.max(0, lender.portfolioPrincipal - chargeOffs - runoff);
  lender.lifetimeInterestIncome += interestIncome;
  lender.lifetimeChargeOffs += chargeOffs;
  lender.lastMonthInterestIncome = interestIncome;
  lender.lastMonthChargeOffs = chargeOffs;
  return interestIncome;
}

/** Moves the captive lender's accumulated cash into the Group Treasury. Returns the amount swept. */
export function sweepCaptiveLenderCash(state: GameState): number {
  const amount = state.captiveLender.cash;
  if (amount <= 0) return 0;
  state.captiveLender.cash = 0;
  state.groupTreasury += amount;
  return amount;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
