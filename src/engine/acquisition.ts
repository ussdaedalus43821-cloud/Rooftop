import type { AllocationTier, AuctionLot, Dealership, Vehicle, VehicleModel } from "../types.js";
import { ALL_FRANCHISE_MODELS, FRANCHISE_CATALOGS } from "../constants.js";
import { Rng } from "../rng.js";
import { nextId } from "../state.js";
import { financeAcquisition } from "./financials.js";
import { lotSpaceRemaining } from "./inventory.js";

const TIER_DESIRABILITY_CAP: Record<AllocationTier, number> = {
  bronze: 0.55,
  silver: 0.72,
  gold: 0.88,
  platinum: 1.01,
};

// Multipliers on a franchise's base (silver-tier) quota — matches the
// original flat 10/18/26/36 ratios so every brand feels the same swing
// between tiers, just scaled to that brand's own volume.
const TIER_QUOTA_MULTIPLIER: Record<AllocationTier, number> = {
  bronze: 0.56,
  silver: 1,
  gold: 1.44,
  platinum: 2,
};

export function tierMonthlyAllocationCap(baseQuota: number, tier: AllocationTier): number {
  return Math.max(1, Math.round(baseQuota * TIER_QUOTA_MULTIPLIER[tier]));
}

function generateVin(rng: Rng): string {
  const chars = "ABCDEFGHJKLMNPRSTUVWXYZ0123456789";
  let vin = "";
  for (let i = 0; i < 17; i++) vin += chars[rng.int(0, chars.length - 1)];
  return vin;
}

/** `houseBrandModels`, when passed, comes from the player's own Manufacturer Co. (already fully-formed VehicleModels, invoice = transfer price) instead of a real franchise's catalog — used for any dealership with isHouseBrand set. */
export function allocationCatalog(d: Dealership, houseBrandModels?: VehicleModel[]): VehicleModel[] {
  const cap = TIER_DESIRABILITY_CAP[d.manufacturer.tier];
  if (houseBrandModels) {
    return houseBrandModels.filter((m) => m.desirability <= cap);
  }
  const brandModels = FRANCHISE_CATALOGS[d.manufacturer.franchiseKey];
  return brandModels.filter((m) => m.desirability <= cap).map((m) => ({
    name: m.name,
    trim: m.trim,
    class: m.class,
    msrp: m.msrp,
    invoice: Math.round(m.msrp * m.invoiceFrac),
    desirability: m.desirability,
  }));
}

export function allocationRemainingThisMonth(d: Dealership): number {
  return Math.max(0, d.manufacturer.allocationCapMonthly - d.manufacturer.allocationOrderedThisMonth);
}

export function makeVehicle(model: VehicleModel, condition: "new" | "used", source: Vehicle["source"], day: number, rng: Rng, odometer: number): Vehicle {
  return {
    id: nextId("veh"),
    model,
    condition,
    vin: generateVin(rng),
    stage: "acquired",
    acquiredDay: day,
    daysInStage: 0,
    daysInInventory: 0,
    acquisitionCost: 0,
    reconCost: 0,
    reconCostEstimate: 0,
    reconDaysRequired: 0,
    odometer,
    listPrice: 0,
    floorPlanBalance: 0,
    floorPlanOriginal: 0,
    curtailmentPaidTiers: 0,
    curtailmentDueSinceDay: 0,
    soldOutOfTrustDays: 0,
    source,
  };
}

export function orderAllocationUnit(d: Dealership, model: VehicleModel, day: number, rng: Rng): Vehicle | null {
  if (allocationRemainingThisMonth(d) <= 0 || lotSpaceRemaining(d) <= 0) return null;
  const v = makeVehicle(model, "new", "allocation", day, rng, rng.int(4, 15));
  financeAcquisition(d, v, model.invoice);
  d.vehicles.push(v);
  d.manufacturer.allocationOrderedThisMonth += 1;
  return v;
}

const AUTO_ORDER_MAX_ON_LOT_PER_MODEL = 4; // don't keep restocking a model that already isn't moving

/**
 * Picks the new model most worth ordering right now: strongest recent sales
 * demand first (last month's units, nudged by this month's pace so far),
 * falling back to catalog desirability for a model with no sales history
 * yet. Skips any model already sitting several-deep unsold on the lot —
 * no point restocking what isn't selling.
 */
function pickBestModelToOrder(d: Dealership, houseBrandModels?: VehicleModel[]): VehicleModel | null {
  const candidates = allocationCatalog(d, houseBrandModels)
    .map((model) => {
      const onLot = d.vehicles.filter((v) => v.stage !== "sold" && v.model.name === model.name && v.model.trim === model.trim).length;
      const stat = d.modelStats[`new|${model.name}|${model.trim}`];
      const demand = stat ? stat.unitsSoldLastMonth + stat.unitsSoldThisMonth * 0.5 : model.desirability * 2;
      return { model, demand, onLot };
    })
    .filter((c) => c.onLot < AUTO_ORDER_MAX_ON_LOT_PER_MODEL);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.demand - a.demand);
  return candidates[0].model;
}

/**
 * Orders a steady one-a-day trickle of the best-selling model, rather than
 * either nothing (forgetting to restock) or the whole month's allocation up
 * front (flooding recon with cars nobody's actually asking for).
 */
export function autoOrderAllocation(d: Dealership, day: number, rng: Rng, houseBrandModels?: VehicleModel[]): Vehicle | null {
  if (d.isUsedOnly || allocationRemainingThisMonth(d) <= 0) return null;
  const model = pickBestModelToOrder(d, houseBrandModels);
  if (!model) return null;
  return orderAllocationUnit(d, model, day, rng);
}

export function generateAuctionLots(rng: Rng, day: number, count = 6): AuctionLot[] {
  const lots: AuctionLot[] = [];
  for (let i = 0; i < count; i++) {
    const base = rng.pick(ALL_FRANCHISE_MODELS);
    const model: VehicleModel = {
      name: base.name,
      trim: base.trim,
      class: base.class,
      msrp: base.msrp,
      invoice: Math.round(base.msrp * base.invoiceFrac),
      desirability: base.desirability,
    };
    const odometer = rng.int(18000, 95000);
    const conditionScore = Math.max(0.15, 1 - odometer / 130000 + rng.range(-0.1, 0.1));
    const marketValue = Math.round(model.msrp * (0.4 + conditionScore * 0.4));
    lots.push({
      id: `${day}_${i}_${nextId("lot")}`,
      model,
      odometer,
      conditionScore,
      marketValue,
      minBid: Math.round(marketValue * 0.55),
    });
  }
  return lots;
}

export function auctionBuyFee(lot: AuctionLot): number {
  return Math.round(lot.marketValue * 0.02) + 150;
}

/**
 * Today's wholesale lots, generated once per game day and cached on the
 * dealership itself (not a UI-local cache) so the auction auto-pilot and
 * the manual Inventory screen always see — and consume from — the same
 * batch, whichever one touches it first.
 */
export function auctionLotsForToday(d: Dealership, day: number, rng: Rng): AuctionLot[] {
  if (d.auctionLotsDay !== day) {
    d.auctionLots = generateAuctionLots(rng, day, 5);
    d.auctionLotsDay = day;
  }
  return d.auctionLots;
}

export interface AuctionResult {
  won: boolean;
  finalPrice: number;
  buyFee: number;
  vehicle?: Vehicle;
  lotFull?: boolean; // won the bid but there was nowhere to put the car
}

export function bidOnAuctionLot(d: Dealership, lot: AuctionLot, bid: number, day: number, rng: Rng): AuctionResult {
  // Competing bids are realistically centered *below* true wholesale value —
  // that's the whole point of a wholesale auction. Bidding at market value
  // should win essentially every time; bidding under it is a real
  // bargain-hunt with real risk of losing the lot. The ceiling is capped at
  // market value itself (not above it) so a market-value bid never needs to
  // be beaten by an overpay just to win.
  const competitivePrice = lot.marketValue * rng.range(0.55, 1.0);
  const buyFee = auctionBuyFee(lot);
  if (bid < lot.minBid) return { won: false, finalPrice: 0, buyFee };
  const won = bid >= competitivePrice;
  if (!won) return { won: false, finalPrice: 0, buyFee };
  if (lotSpaceRemaining(d) <= 0) return { won: false, finalPrice: 0, buyFee, lotFull: true };
  const v = makeVehicle(lot.model, "used", "auction", day, rng, lot.odometer);
  financeAcquisition(d, v, bid + buyFee);
  d.vehicles.push(v);
  return { won: true, finalPrice: bid + buyFee, buyFee, vehicle: v };
}

/**
 * Bid on every remaining lot in today's auction at the player's chosen
 * discount off market value, capped at what the house will even accept
 * (minBid). A lot the discount prices below minBid is skipped outright —
 * auto-pilot won't chase a lot outside the player's own risk tolerance.
 */
export function autoBidAuctionLots(d: Dealership, day: number, rng: Rng): AuctionResult[] {
  const lots = auctionLotsForToday(d, day, rng);
  const results: AuctionResult[] = [];
  for (const lot of [...lots]) {
    if (lotSpaceRemaining(d) <= 0) break;
    const targetBid = Math.round(lot.marketValue * (1 - d.auctionAutoBidDiscountPct / 100));
    if (targetBid < lot.minBid) continue;
    const result = bidOnAuctionLot(d, lot, targetBid, day, rng);
    if (result.won) {
      d.auctionLots = d.auctionLots.filter((l) => l.id !== lot.id);
      results.push(result);
    }
  }
  return results;
}

export function createTradeInVehicle(d: Dealership, model: VehicleModel, odometer: number, appraisedValue: number, day: number, rng: Rng): Vehicle {
  const v = makeVehicle(model, "used", "tradein", day, rng, odometer);
  financeAcquisition(d, v, appraisedValue);
  d.vehicles.push(v);
  return v;
}
