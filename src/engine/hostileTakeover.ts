// ---------------------------------------------------------------------------
// Hostile takeovers — the reverse of buying a competitor (expansion.ts): a
// rival operator comes after one of YOUR stores. Two scopes, escalating
// with the same metrics that already drive everything else in the game:
//   - "dealership": targets your weakest store (lowest reputation) once the
//     group is established enough to be worth anyone's trouble. A real
//     consequence of neglect, not a pure dice roll against a new player.
//   - "group": once the group is genuinely wealthy, a determined rival goes
//     after your flagship (highest-value) store instead — your own success
//     paints a target on your best asset, not your worst one.
// Either way you get a real window to respond: pay to defend it outright,
// or do nothing and lose it to a forced sale well below what you'd get
// selling it yourself. Never targets your only dealership — losing your
// entire operation to a random event with no recourse isn't a fun twist,
// it's a bad one.
// ---------------------------------------------------------------------------
import type { GameState, TakeoverThreat } from "../types.js";
import { Rng } from "../rng.js";
import { postCashExpense } from "./financials.js";
import { computeGroupNetWorth } from "./career.js";
import { appraiseDealership } from "./expansion.js";

// Established enough to be worth a rival's trouble — well past a brand-new
// single-store player, but nowhere near what it takes to draw a group-wide bid.
const DEALERSHIP_THREAT_MIN_NET_WORTH = 5_000_000;
// Only a genuinely wealthy group attracts a bid for its flagship store.
const GROUP_THREAT_MIN_NET_WORTH = 75_000_000;

const DAILY_THREAT_CHANCE = 1 / 400; // rare — a memorable event, not a monthly chore
const THREAT_WINDOW_DAYS = 25;
const GROUP_SCOPE_SHARE = 0.4; // once eligible for a group-scope bid, the odds it's that instead of a dealership-scope one

// Both fractions of the target's own appraised value (see expansion.ts's
// appraiseDealership). A forced sale is worse than a voluntary one; a
// determined group-wide bidder costs more to fend off than a
// dealership-level opportunist, but is still cheaper than losing the store.
const DEALERSHIP_FORCED_PRICE_FRACTION = 0.6;
const GROUP_FORCED_PRICE_FRACTION = 0.55;
const DEALERSHIP_DEFEND_COST_FRACTION = 0.22;
const GROUP_DEFEND_COST_FRACTION = 0.18;

const RIVAL_PREFIXES = ["Ironclad", "Meridian Capital", "Blackwell", "Summit Holdings", "Apex", "Continental", "Sterling", "Vanguard Equity", "Northbridge", "Colonial"];
const RIVAL_SUFFIXES = ["Auto Group", "Motors Holdings", "Automotive Partners", "Capital Group", "Dealership Partners"];

export interface HostileTakeoverTickResult {
  started?: TakeoverThreat;
  lost?: { dealershipName: string; forcedPrice: number; rivalName: string };
}

/** Run once per game day, group-wide (not per dealership). */
export function tickHostileTakeoverDaily(state: GameState, rng: Rng): HostileTakeoverTickResult {
  const result: HostileTakeoverTickResult = {};
  const threat = state.takeoverThreat;

  if (threat) {
    const target = state.dealerships[threat.targetDealershipId];
    if (!target) {
      // Sold or otherwise gone on its own — the bid is moot.
      state.takeoverThreat = null;
      return result;
    }
    if (state.day >= threat.deadlineDay) {
      if (Object.keys(state.dealerships).length <= 1) {
        // Never actually takes your last dealership, even if it was your
        // only one at the deadline (e.g. you sold others in the meantime).
        state.takeoverThreat = null;
        return result;
      }
      const name = target.name;
      state.groupTreasury += threat.forcedPrice;
      delete state.dealerships[threat.targetDealershipId];
      if (state.activeDealershipId === threat.targetDealershipId) {
        state.activeDealershipId = Object.keys(state.dealerships)[0];
      }
      state.takeoverThreat = null;
      result.lost = { dealershipName: name, forcedPrice: threat.forcedPrice, rivalName: threat.rivalName };
    }
    return result;
  }

  const dealerships = Object.values(state.dealerships);
  if (dealerships.length <= 1) return result; // never targets your only store
  const netWorth = computeGroupNetWorth(state);
  if (netWorth < DEALERSHIP_THREAT_MIN_NET_WORTH) return result;
  if (!rng.chance(DAILY_THREAT_CHANCE)) return result;

  const groupEligible = netWorth >= GROUP_THREAT_MIN_NET_WORTH;
  const scope: TakeoverThreat["scope"] = groupEligible && rng.chance(GROUP_SCOPE_SHARE) ? "group" : "dealership";

  const target = scope === "group"
    ? dealerships.reduce((best, d) => (appraiseDealership(d) > appraiseDealership(best) ? d : best))
    : dealerships.reduce((worst, d) => (d.reputation < worst.reputation ? d : worst));

  const appraisal = appraiseDealership(target);
  const forcedPrice = Math.round(appraisal * (scope === "group" ? GROUP_FORCED_PRICE_FRACTION : DEALERSHIP_FORCED_PRICE_FRACTION));
  const defendCost = Math.round(appraisal * (scope === "group" ? GROUP_DEFEND_COST_FRACTION : DEALERSHIP_DEFEND_COST_FRACTION));

  const newThreat: TakeoverThreat = {
    scope,
    targetDealershipId: target.id,
    rivalName: `${rng.pick(RIVAL_PREFIXES)} ${rng.pick(RIVAL_SUFFIXES)}`,
    startDay: state.day,
    deadlineDay: state.day + THREAT_WINDOW_DAYS,
    forcedPrice,
    defendCost,
  };
  state.takeoverThreat = newThreat;
  result.started = newThreat;
  return result;
}

export type TakeoverDefenseFunding = "active" | "treasury";

export interface DefendTakeoverResult {
  ok: boolean;
  reason?: string;
}

export function defendTakeover(state: GameState, funding: TakeoverDefenseFunding, payerDealershipId: string): DefendTakeoverResult {
  const threat = state.takeoverThreat;
  if (!threat) return { ok: false, reason: "No active takeover threat." };

  if (funding === "treasury") {
    if (state.groupTreasury < threat.defendCost) return { ok: false, reason: "Not enough in the group treasury." };
    state.groupTreasury -= threat.defendCost;
  } else {
    const payer = state.dealerships[payerDealershipId];
    if (!payer) return { ok: false, reason: "Dealership not found." };
    if (payer.ledger.cash < threat.defendCost) return { ok: false, reason: "Not enough cash on hand." };
    postCashExpense(payer, threat.defendCost);
  }

  state.takeoverThreat = null;
  return { ok: true };
}
