// ---------------------------------------------------------------------------
// Macro backdrop, redone around real economic history instead of an
// independent random-event pool. The economy now always sits in one of a
// handful of named eras — expansion, a late-cycle credit boom, a genuine
// credit crisis, an ordinary recession, recovery, a supply shock, a rate
// shock — each calibrated against real U.S. auto-industry and macro data,
// and each one's likely successor shaped by how real business cycles
// actually sequence (booms run long and precede busts; recessions are
// short and are followed by a real recovery before the next expansion),
// not a flat, memoryless coin flip every day. A slow sentiment drift is
// layered on top so no two stretches of the same era feel identical.
//
// Real-world grounding for the numbers below:
//   - Expansions: postwar U.S. expansions have averaged ~5 years, ranging
//     from under 2 to the 2009-2020 expansion's nearly 11.
//   - Late-cycle boom -> credit shock: modeled on 2003-2007's loose-credit
//     run-up into 2008-2009, when U.S. new-vehicle sales fell from a
//     16.1M annual pace to 10.4M in under two years — a ~35% collapse.
//   - Ordinary recessions: NBER-dated postwar U.S. recessions have mostly
//     run 6-16 months (1990-91: 8mo; 2001: 8mo; 1981-82: 16mo).
//   - Supply shock: modeled on the 2021-2022 semiconductor shortage, when
//     scarce inventory briefly handed dealers real pricing power and
//     buyers paid at or above sticker with little room to haggle.
//   - Rate shock: modeled on 1979-1982, when the prime rate peaked above
//     20% and auto affordability collapsed almost overnight.
// ---------------------------------------------------------------------------
import type { EconomicEra, EconomicRegime, EconomyState, GameState } from "../types.js";
import { Rng } from "../rng.js";
import { toCalendarDate } from "./clock.js";

const SENTIMENT_REVERSION_RATE = 0.015;
const SENTIMENT_DAILY_NOISE = 0.008;
const SENTIMENT_MIN = 0.85;
const SENTIMENT_MAX = 1.15;
const ERA_LOG_MAX = 12;

interface RegimeSpec {
  headline: string;
  description: string;
  minDays: number;
  maxDays: number;
  demandMult: [number, number];
  rateAdj: [number, number];
  priceToleranceMult: [number, number];
  next: Partial<Record<EconomicRegime, number>>; // relative weights for what follows once this era's duration runs out
}

const REGIME_SPECS: Record<EconomicRegime, RegimeSpec> = {
  expansion: {
    headline: "Steady Economic Expansion",
    description: "A normal, healthy growth cycle — the kind that makes up most of any real stretch of economic history.",
    minDays: 900, maxDays: 3200,
    demandMult: [0.95, 1.1],
    rateAdj: [-0.005, 0.005],
    priceToleranceMult: [1, 1],
    next: { lateCycleBoom: 0.5, supplyShock: 0.12, rateShock: 0.08, recession: 0.3 },
  },
  lateCycleBoom: {
    headline: "Late-Cycle Credit Boom",
    description: "Cheap, easy credit and red-hot demand — the kind of run-up that preceded 2008: lenders loosening standards, buyers stretching further than they should.",
    minDays: 365, maxDays: 1460,
    demandMult: [1.15, 1.35],
    rateAdj: [-0.02, -0.005],
    priceToleranceMult: [1, 1.05],
    next: { creditShock: 0.6, recession: 0.2, expansion: 0.2 },
  },
  creditShock: {
    headline: "Credit Crisis",
    description: "A genuine credit crunch — lending freezes almost overnight, and buyers who qualified last month don't anymore. Modeled on 2008-2009, when U.S. new-vehicle sales collapsed from a 16.1M annual pace to 10.4M in under two years.",
    minDays: 365, maxDays: 730,
    demandMult: [0.6, 0.72],
    rateAdj: [0.03, 0.05],
    priceToleranceMult: [1, 1],
    next: { recovery: 0.85, recession: 0.15 },
  },
  recession: {
    headline: "Recession",
    description: "A real but more ordinary downturn — closer to 1990-91 or 2001 than a full-blown crisis.",
    minDays: 180, maxDays: 480,
    demandMult: [0.75, 0.88],
    rateAdj: [0.01, 0.025],
    priceToleranceMult: [1, 1],
    next: { recovery: 0.8, creditShock: 0.2 },
  },
  recovery: {
    headline: "Recovery",
    description: "Demand is climbing back, but it takes real time to rebuild — the recovery after 2009 took years to fully restore volume.",
    minDays: 365, maxDays: 1095,
    demandMult: [0.85, 1.0],
    rateAdj: [-0.01, 0],
    priceToleranceMult: [1, 1],
    next: { expansion: 1 },
  },
  supplyShock: {
    headline: "Supply Shock — Inventory Scarcity",
    description: "Production can't keep up with demand — modeled on the 2021-2022 semiconductor shortage, when scarce inventory briefly gave dealers real pricing power and buyers paid at or above sticker with little room to haggle.",
    minDays: 365, maxDays: 730,
    demandMult: [0.85, 0.95],
    rateAdj: [0, 0.01],
    priceToleranceMult: [1.12, 1.25],
    next: { expansion: 0.6, recovery: 0.4 },
  },
  rateShock: {
    headline: "Interest Rate Shock",
    description: "A sharp, deliberate rate-hiking cycle — modeled on 1979-1982, when the prime rate peaked above 20% and auto affordability collapsed almost overnight.",
    minDays: 365, maxDays: 1095,
    demandMult: [0.68, 0.8],
    rateAdj: [0.045, 0.075],
    priceToleranceMult: [1, 1],
    next: { recession: 0.5, recovery: 0.5 },
  },
};

function midpoint(range: [number, number]): number {
  return (range[0] + range[1]) / 2;
}

function buildEra(regime: EconomicRegime, day: number, rng: Rng): EconomicEra {
  const spec = REGIME_SPECS[regime];
  const duration = rng.int(spec.minDays, spec.maxDays);
  return {
    regime,
    headline: spec.headline,
    description: spec.description,
    startDay: day,
    endDay: day + duration,
    demandMult: rng.range(spec.demandMult[0], spec.demandMult[1]),
    rateAdj: rng.range(spec.rateAdj[0], spec.rateAdj[1]),
    priceToleranceMult: rng.range(spec.priceToleranceMult[0], spec.priceToleranceMult[1]),
  };
}

function pickWeighted(weights: Partial<Record<EconomicRegime, number>>, rng: Rng): EconomicRegime {
  const entries = Object.entries(weights) as [EconomicRegime, number][];
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = rng.next() * total;
  for (const [regime, w] of entries) {
    if (roll < w) return regime;
    roll -= w;
  }
  return entries[entries.length - 1][0];
}

/** Deterministic starting state (no rng available at factory time) — the game always opens mid-expansion, at that regime's typical midpoint magnitude. Real variety kicks in at the first era transition, which does use the game's own rng. */
export function newEconomyState(): EconomyState {
  const spec = REGIME_SPECS.expansion;
  return {
    sentiment: 1,
    currentEra: {
      regime: "expansion",
      headline: spec.headline,
      description: spec.description,
      startDay: 0,
      endDay: Math.round(midpoint([spec.minDays, spec.maxDays])),
      demandMult: midpoint(spec.demandMult),
      rateAdj: midpoint(spec.rateAdj),
      priceToleranceMult: midpoint(spec.priceToleranceMult),
    },
    eraLog: [],
  };
}

export interface EconomyTickResult {
  eraChanged?: EconomicEra;
}

/** Run once per game day, group-wide (not per dealership). */
export function tickEconomyDaily(state: GameState, rng: Rng): EconomyTickResult {
  const econ = state.economy;
  const result: EconomyTickResult = {};

  // A small daily drift layered on top of whatever era is live, so even a
  // multi-year expansion doesn't feel perfectly flat.
  econ.sentiment += (1 - econ.sentiment) * SENTIMENT_REVERSION_RATE + rng.gaussian(0, SENTIMENT_DAILY_NOISE);
  econ.sentiment = clamp(econ.sentiment, SENTIMENT_MIN, SENTIMENT_MAX);

  if (state.day >= econ.currentEra.endDay) {
    const spec = REGIME_SPECS[econ.currentEra.regime];
    const nextRegime = pickWeighted(spec.next, rng);
    const newEra = buildEra(nextRegime, state.day, rng);
    econ.currentEra = newEra;
    econ.eraLog.push({ day: state.day, headline: newEra.headline });
    if (econ.eraLog.length > ERA_LOG_MAX) econ.eraLog.shift();
    result.eraChanged = newEra;
  }

  return result;
}

export function economyDemandMultiplier(state: GameState): number {
  return clamp(state.economy.sentiment * state.economy.currentEra.demandMult, 0.3, 1.9);
}

export function economyRateAdj(state: GameState): number {
  return state.economy.currentEra.rateAdj;
}

export function economyPriceToleranceMult(state: GameState): number {
  return state.economy.currentEra.priceToleranceMult;
}

export function economyMoodLabel(state: GameState): string {
  const s = state.economy.sentiment;
  if (s >= 1.06) return "Improving";
  if (s >= 0.98) return "Steady";
  return "Softening";
}

// A within-year traffic rhythm layered on top of the multi-year regime
// cycle above — real showroom traffic isn't flat across a calendar year.
// Spring/early summer is the traditional selling season; February-April
// gets a real, well-documented bump from tax-refund buyers (used-vehicle
// lots especially); year-end brings a clearance/new-model-year push;
// January and the fall are the traditional lulls. Indexed to average 1.0
// across the year, so this redistributes WHEN traffic happens rather than
// inflating or deflating the total.
const SEASONAL_TRAFFIC_BY_MONTH = [
  0.80, // January — post-holiday lull
  0.95, // February — tax-refund season begins
  1.15, // March — tax-refund season peaks, spring selling season starts
  1.15, // April — tax-refund season, spring
  1.10, // May — Memorial Day sales events
  1.05, // June
  1.05, // July — July 4th sales events
  1.00, // August — model year-end clearance begins
  0.95, // September — Labor Day, back-to-school
  0.90, // October
  0.90, // November — pre-holiday lull
  1.15, // December — year-end clearance, new model year, tax write-off buyers
];

export function seasonalTrafficMultiplier(day: number): number {
  return SEASONAL_TRAFFIC_BY_MONTH[toCalendarDate(day).month];
}

export function seasonalTrafficLabel(day: number): string {
  const mult = seasonalTrafficMultiplier(day);
  if (mult >= 1.1) return "Peak selling season — showroom traffic running well above normal";
  if (mult >= 1.0) return "Solid seasonal demand — traffic a bit above normal";
  if (mult >= 0.92) return "Average seasonal demand";
  return "Seasonal lull — showroom traffic running below normal";
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
