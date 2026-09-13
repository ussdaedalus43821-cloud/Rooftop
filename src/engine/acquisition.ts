import type { AllocationTier, Dealership, Vehicle, VehicleModel } from "../types.js";
import { ALL_FRANCHISE_MODELS, FRANCHISE_CATALOGS } from "../constants.js";
import { Rng } from "../rng.js";
import { nextId } from "../state.js";
import { financeAcquisition } from "./financials.js";

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

export function allocationCatalog(d: Dealership): VehicleModel[] {
  const cap = TIER_DESIRABILITY_CAP[d.manufacturer.tier];
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
  if (allocationRemainingThisMonth(d) <= 0) return null;
  const v = makeVehicle(model, "new", "allocation", day, rng, rng.int(4, 15));
  financeAcquisition(d, v, model.invoice);
  d.vehicles.push(v);
  d.manufacturer.allocationOrderedThisMonth += 1;
  return v;
}

export interface AuctionLot {
  id: string;
  model: VehicleModel;
  odometer: number;
  conditionScore: number; // 0-1
  marketValue: number; // "true" wholesale value
  minBid: number;
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

export interface AuctionResult {
  won: boolean;
  finalPrice: number;
  vehicle?: Vehicle;
}

export function bidOnAuctionLot(d: Dealership, lot: AuctionLot, bid: number, day: number, rng: Rng): AuctionResult {
  // Competing bids are realistically centered *below* true wholesale value —
  // that's the whole point of a wholesale auction. Bidding at market value
  // should win nearly every time; bidding under it is a real bargain-hunt
  // with real risk of losing the lot, not a near-guaranteed overpay.
  const competitivePrice = lot.marketValue * rng.range(0.6, 1.03);
  if (bid < lot.minBid) return { won: false, finalPrice: 0 };
  const won = bid >= competitivePrice;
  if (!won) return { won: false, finalPrice: 0 };
  const buyFee = Math.round(lot.marketValue * 0.02) + 150;
  const v = makeVehicle(lot.model, "used", "auction", day, rng, lot.odometer);
  financeAcquisition(d, v, bid + buyFee);
  d.vehicles.push(v);
  return { won: true, finalPrice: bid + buyFee, vehicle: v };
}

export function createTradeInVehicle(d: Dealership, model: VehicleModel, odometer: number, appraisedValue: number, day: number, rng: Rng): Vehicle {
  const v = makeVehicle(model, "used", "tradein", day, rng, odometer);
  financeAcquisition(d, v, appraisedValue);
  d.vehicles.push(v);
  return v;
}
