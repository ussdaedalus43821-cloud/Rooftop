// ---------------------------------------------------------------------------
// Macro backdrop: a slow-drifting sentiment index plus occasional named
// events, both pushing on customer demand and credit pricing group-wide.
// Nothing before this made growth anything but monotonic — reputation and
// cash only ever went up on their own timeline. This is the counterweight:
// real, felt swings the player has to manage around, not cosmetic flavor
// text on a toast.
// ---------------------------------------------------------------------------
import type { EconomicEvent, EconomyState, GameState } from "../types.js";
import { Rng } from "../rng.js";

const SENTIMENT_REVERSION_RATE = 0.015;
const SENTIMENT_DAILY_NOISE = 0.008;
const SENTIMENT_MIN = 0.55;
const SENTIMENT_MAX = 1.45;
const EVENT_LOG_MAX = 12;

interface EventSpec {
  key: string;
  headline: string;
  description: string;
  minDays: number;
  maxDays: number;
  demandMult: number;
  rateAdj: number; // added to every customer's credit buy-rate APR
}

// A mix of good and bad, roughly balanced, so the market genuinely swings
// both ways instead of only ever working against the player.
const EVENT_POOL: EventSpec[] = [
  {
    key: "recession",
    headline: "Recession Hits Consumer Spending",
    description: "Layoffs and tightening budgets are keeping shoppers off dealer lots nationwide.",
    minDays: 60, maxDays: 120, demandMult: 0.6, rateAdj: 0.01,
  },
  {
    key: "boom",
    headline: "Economic Boom Lifts Consumer Confidence",
    description: "Strong job growth and rising wages have buyers back in showrooms in force.",
    minDays: 45, maxDays: 90, demandMult: 1.4, rateAdj: -0.005,
  },
  {
    key: "rate_hike",
    headline: "Federal Reserve Raises Interest Rates",
    description: "Higher benchmark rates are pushing up auto loan APRs across every credit tier.",
    minDays: 60, maxDays: 150, demandMult: 0.85, rateAdj: 0.025,
  },
  {
    key: "rate_cut",
    headline: "Federal Reserve Cuts Interest Rates",
    description: "Cheaper financing is pulling buyers who'd been waiting on the sidelines back into the market.",
    minDays: 60, maxDays: 150, demandMult: 1.2, rateAdj: -0.02,
  },
  {
    key: "credit_crunch",
    headline: "Lenders Tighten Credit Standards",
    description: "Banks are pulling back on auto lending, and the buyers who still qualify are paying more for it.",
    minDays: 45, maxDays: 90, demandMult: 0.8, rateAdj: 0.03,
  },
  {
    key: "confidence_surge",
    headline: "Consumer Confidence Hits a Multi-Year High",
    description: "Optimistic households are opening their wallets for big-ticket purchases again.",
    minDays: 30, maxDays: 75, demandMult: 1.25, rateAdj: 0,
  },
  {
    key: "fuel_spike",
    headline: "Fuel Prices Spike at the Pump",
    description: "Sticker shock at the pump is making buyers think twice before a big purchase of any kind.",
    minDays: 30, maxDays: 60, demandMult: 0.9, rateAdj: 0,
  },
  {
    key: "stimulus",
    headline: "Government Stimulus Reaches Households",
    description: "A fresh round of direct payments is showing up as extra down-payment cash on dealer lots.",
    minDays: 20, maxDays: 45, demandMult: 1.3, rateAdj: -0.01,
  },
];

const DAILY_EVENT_CHANCE = 1 / 75; // roughly once a quarter on average, when no event is already live

export function newEconomyState(): EconomyState {
  return { sentiment: 1, currentEvent: null, eventLog: [] };
}

function logEvent(econ: EconomyState, day: number, headline: string): void {
  econ.eventLog.push({ day, headline });
  if (econ.eventLog.length > EVENT_LOG_MAX) econ.eventLog.shift();
}

export interface EconomyTickResult {
  eventStarted?: EconomicEvent;
  eventEndedHeadline?: string;
}

/** Run once per game day, group-wide (not per dealership). */
export function tickEconomyDaily(state: GameState, rng: Rng): EconomyTickResult {
  const econ = state.economy;
  const result: EconomyTickResult = {};

  econ.sentiment += (1 - econ.sentiment) * SENTIMENT_REVERSION_RATE + rng.gaussian(0, SENTIMENT_DAILY_NOISE);
  econ.sentiment = clamp(econ.sentiment, SENTIMENT_MIN, SENTIMENT_MAX);

  if (econ.currentEvent && state.day >= econ.currentEvent.endDay) {
    result.eventEndedHeadline = econ.currentEvent.headline;
    logEvent(econ, state.day, `${econ.currentEvent.headline} has run its course — the market is normalizing.`);
    econ.currentEvent = null;
  }

  if (!econ.currentEvent && rng.chance(DAILY_EVENT_CHANCE)) {
    const spec = rng.pick(EVENT_POOL);
    const duration = rng.int(spec.minDays, spec.maxDays);
    const event: EconomicEvent = {
      key: spec.key,
      headline: spec.headline,
      description: spec.description,
      startDay: state.day,
      endDay: state.day + duration,
      demandMult: spec.demandMult,
      rateAdj: spec.rateAdj,
    };
    econ.currentEvent = event;
    result.eventStarted = event;
    logEvent(econ, state.day, spec.headline);
  }

  return result;
}

export function economyDemandMultiplier(state: GameState): number {
  const eventMult = state.economy.currentEvent?.demandMult ?? 1;
  return clamp(state.economy.sentiment * eventMult, 0.3, 1.9);
}

export function economyRateAdj(state: GameState): number {
  return state.economy.currentEvent?.rateAdj ?? 0;
}

export function economyMoodLabel(state: GameState): string {
  const s = state.economy.sentiment;
  if (s >= 1.2) return "Strong";
  if (s >= 1.05) return "Healthy";
  if (s >= 0.95) return "Neutral";
  if (s >= 0.8) return "Soft";
  return "Weak";
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
