import type { Customer, Deal, Dealership, FourSquareTerms, StaffMember, Vehicle, VehicleClass } from "../types.js";
import { CUSTOMER_FIRST_NAMES, CUSTOMER_LAST_NAMES, TRADE_IN_MODELS } from "../constants.js";
import { Rng } from "../rng.js";
import { nextId } from "../state.js";
import { unitsOnLot } from "./inventory.js";

const MAX_CONCURRENT_DEALS_PER_REP = 2;

export function computeMonthlyPayment(amountFinanced: number, apr: number, termMonths: number): number {
  if (amountFinanced <= 0) return 0;
  const r = apr / 12;
  if (r <= 0.00001) return amountFinanced / termMonths;
  const factor = Math.pow(1 + r, termMonths);
  return (amountFinanced * r * factor) / (factor - 1);
}

export function buildTerms(price: number, tradeAllowance: number, downPayment: number, termMonths: number, aprBuyRate: number, aprSellRate: number): FourSquareTerms {
  const amountFinanced = Math.max(0, price - tradeAllowance - downPayment);
  return {
    price,
    tradeAllowance,
    downPayment,
    termMonths,
    aprBuyRate,
    aprSellRate,
    monthlyPayment: computeMonthlyPayment(amountFinanced, aprSellRate, termMonths),
  };
}

// rateAdj comes from the current macro event (see engine/economy.ts) — a
// rate hike or credit crunch pushes every tier's APR up, a rate cut pulls
// it back down, on top of the flat base rate each tier already carries.
function buyRateForTier(tier: Customer["creditTier"], rateAdj: number): number {
  if (tier === "prime") return clamp(0.055 + rateAdj, 0.02, 0.35);
  if (tier === "nearprime") return clamp(0.09 + rateAdj, 0.03, 0.4);
  return clamp(0.155 + rateAdj, 0.05, 0.45);
}

function creditProfile(rng: Rng, rateAdj: number): { tier: Customer["creditTier"]; buyRate: number } {
  const roll = rng.next();
  const tier: Customer["creditTier"] = roll < 0.55 ? "prime" : roll < 0.85 ? "nearprime" : "subprime";
  return { tier, buyRate: buyRateForTier(tier, rateAdj) };
}

function randomModelClass(d: Dealership, rng: Rng): VehicleClass {
  const lot = unitsOnLot(d);
  if (lot.length === 0) return rng.pick<VehicleClass>(["sedan", "suv", "truck", "coupe", "minivan", "ev"]);
  return rng.pick(lot).model.class;
}

export function generateCustomer(d: Dealership, day: number, rng: Rng, rateAdj: number = 0): Customer {
  const credit = creditProfile(rng, rateAdj);
  const hasTrade = rng.chance(0.45);
  const name = `${rng.pick(CUSTOMER_FIRST_NAMES)} ${rng.pick(CUSTOMER_LAST_NAMES)}`;
  return {
    id: nextId("cust"),
    name,
    budgetMonthly: 0, // set once the vehicle they're shopping is known, see tryCreateUp
    downPaymentCash: Math.round(rng.range(0, 6000)),
    creditTier: credit.tier,
    hasTrade,
    tradeVehicle: hasTrade
      ? (() => {
          const model = rng.pick(TRADE_IN_MODELS);
          const year = rng.int(2014, 2022);
          return {
            description: `${year} ${model.name}`,
            modelName: model.name,
            class: model.class,
            year,
            marketValue: Math.round(rng.range(3500, 22000)),
            condition: rng.range(0.3, 0.9),
          };
        })()
      : undefined,
    interestedModelClass: randomModelClass(d, rng),
    patience: rng.int(2, 4),
    priceFlexibility: rng.range(0.03, 0.14),
  };
}

export function customerTargetPrice(customer: Customer, vehicle: Vehicle): number {
  if (vehicle.condition === "new") {
    // A savvy shopper expects to land somewhere between invoice and
    // sticker, not literally at dealer cost — split the markup band down
    // the middle so a normal front-end profit doesn't read as gouging.
    return vehicle.model.invoice + (vehicle.model.msrp - vehicle.model.invoice) * 0.5;
  }
  // Used cars carry a real recon + margin expectation, not a razor-thin
  // 4% over cost.
  return (vehicle.acquisitionCost + vehicle.reconCost) * 1.12;
}

function leastBusySalesperson(d: Dealership): StaffMember | null {
  const reps = d.staff.filter((s) => s.role === "salesperson");
  if (reps.length === 0) return null;
  const load = new Map<string, number>();
  for (const deal of d.deals) {
    if (deal.salespersonId && (deal.stage === "negotiating" || deal.stage === "agreed" || deal.stage === "fi")) {
      load.set(deal.salespersonId, (load.get(deal.salespersonId) ?? 0) + 1);
    }
  }
  const available = reps.filter((r) => (load.get(r.id) ?? 0) < MAX_CONCURRENT_DEALS_PER_REP);
  if (available.length === 0) return null;
  available.sort((a, b) => (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0));
  return available[0];
}

// demandMult comes from engine/economy.ts's sentiment index and current
// event — a recession or credit crunch thins out walk-in traffic, a boom
// or stimulus swells it, on top of whatever reputation and lot size alone
// would draw in.
export function dailyUpCount(d: Dealership, rng: Rng, demandMult: number = 1): number {
  const base = (3 + d.reputation / 22 + Math.min(unitsOnLot(d).length, 30) / 10) * demandMult;
  return Math.max(0, Math.round(rng.gaussian(base, base * 0.25)));
}

function vehiclesInActiveDeals(d: Dealership): Set<string> {
  const ids = new Set<string>();
  for (const deal of d.deals) {
    if (deal.stage === "negotiating" || deal.stage === "agreed" || deal.stage === "fi") ids.add(deal.vehicleId);
  }
  return ids;
}

export function tryCreateUp(d: Dealership, day: number, rng: Rng, rateAdj: number = 0): Deal | null {
  const reserved = vehiclesInActiveDeals(d);
  const lot = unitsOnLot(d).filter((v) => !reserved.has(v.id));
  if (lot.length === 0) return null;
  const rep = leastBusySalesperson(d);
  if (!rep) return null;

  const customer = generateCustomer(d, day, rng, rateAdj);
  const matches = lot.filter((v) => v.model.class === customer.interestedModelClass);
  const vehicle = matches.length > 0 ? rng.pick(matches) : rng.pick(lot);

  // A customer's real-world budget tracks whatever they're actually
  // shopping, not a flat nationwide number — otherwise a $900/mo ceiling
  // makes every deal on a $70k+ truck or a luxury lot look unaffordable
  // no matter how good the price is.
  const buyRate = buyRateForTier(customer.creditTier, rateAdj);
  const referenceFinanced = Math.max(0, vehicle.listPrice - customer.downPaymentCash) * rng.range(0.85, 1);
  const referencePayment = computeMonthlyPayment(referenceFinanced, buyRate, 60);
  customer.budgetMonthly = Math.round(referencePayment * rng.range(0.85, 1.2));

  const target = customerTargetPrice(customer, vehicle);
  const terms = buildTerms(vehicle.listPrice, 0, customer.downPaymentCash, 60, buyRate, buyRate + 0.025);
  const deal: Deal = {
    id: nextId("deal"),
    customer,
    vehicleId: vehicle.id,
    stage: "negotiating",
    round: 0,
    terms,
    frontEndGross: 0,
    fiGross: 0,
    fiProducts: [],
    financeReserve: 0,
    salespersonId: rep.id,
    createdDay: day,
    lastCustomerMood: 0,
    log: [`${customer.name} is looking at the ${vehicle.model.name} ${vehicle.model.trim} (target ~$${Math.round(target).toLocaleString()}).`],
  };
  d.deals.push(deal);
  return deal;
}

export interface OfferOutcome {
  outcome: "accept" | "counter" | "walk";
  mood: number;
  message: string;
}

export function evaluateOffer(d: Dealership, deal: Deal, vehicle: Vehicle, rng: Rng): OfferOutcome {
  const customer = deal.customer;
  const target = customerTargetPrice(customer, vehicle);
  const ceiling = target * (1 + customer.priceFlexibility);
  const priceScore = clamp((ceiling - deal.terms.price) / Math.max(1, ceiling - target), -1.3, 1.3);

  const paymentScore = clamp((customer.budgetMonthly * 1.12 - deal.terms.monthlyPayment) / (customer.budgetMonthly * 0.35), -1.3, 1.3);

  let tradeScore = 0;
  if (customer.hasTrade && customer.tradeVehicle) {
    const fairFloor = customer.tradeVehicle.marketValue * 0.85;
    tradeScore = clamp((deal.terms.tradeAllowance - fairFloor) / (customer.tradeVehicle.marketValue * 0.3), -1.3, 1.3);
  }

  const rep = d.staff.find((s) => s.id === deal.salespersonId);
  const persuasion = rep ? (rep.skill / 100) * 0.18 : 0;

  const weights = customer.hasTrade ? [0.42, 0.34, 0.24] : [0.6, 0.4, 0];
  let mood = priceScore * weights[0] + paymentScore * weights[1] + tradeScore * weights[2] + persuasion;
  mood += rng.range(-0.06, 0.06);
  mood = clamp(mood, -1.5, 1.5);
  deal.lastCustomerMood = mood;

  const desperate = deal.round >= customer.patience - 1;
  if (mood > (desperate ? 0.0 : 0.18)) {
    return { outcome: "accept", mood, message: `${customer.name} says that works.` };
  }
  if (mood < -0.4 || deal.round >= customer.patience) {
    return { outcome: "walk", mood, message: `${customer.name} isn't comfortable with these numbers and walks.` };
  }
  return { outcome: "counter", mood, message: `${customer.name} wants better numbers.` };
}

function counterTerms(deal: Deal, vehicle: Vehicle, customer: Customer): FourSquareTerms {
  const target = customerTargetPrice(customer, vehicle);
  const nudgedPrice = Math.round((deal.terms.price + target) / 2);
  let nudgedTrade = deal.terms.tradeAllowance;
  if (customer.hasTrade && customer.tradeVehicle) {
    const wanted = customer.tradeVehicle.marketValue * 0.95;
    nudgedTrade = Math.round((deal.terms.tradeAllowance + wanted) / 2);
  }
  return buildTerms(nudgedPrice, nudgedTrade, deal.terms.downPayment, deal.terms.termMonths, deal.terms.aprBuyRate, deal.terms.aprSellRate);
}

/**
 * Let a hired salesperson work a deal end-to-end using their own skill,
 * instead of requiring the player to pick every number. A skilled rep opens
 * closer to the customer's ceiling (more profit) and negotiates the trade
 * more firmly; a green rep opens closer to the customer's target (safer,
 * thinner gross). Reuses the same round-by-round negotiation math a player
 * would drive by hand, just run to resolution in one pass.
 */
export function autoNegotiateDeal(d: Dealership, deal: Deal, vehicle: Vehicle, rng: Rng): OfferOutcome | null {
  const rep = d.staff.find((s) => s.id === deal.salespersonId);
  const skill = clamp(rep ? rep.skill : 40, 0, 100);
  const aggressiveness = clamp(0.35 + (skill / 100) * 0.55, 0.35, 0.9);

  const target = customerTargetPrice(deal.customer, vehicle);
  const ceiling = target * (1 + deal.customer.priceFlexibility);
  let price = Math.round(target + (ceiling - target) * aggressiveness);

  let tradeAllowance = deal.terms.tradeAllowance;
  if (deal.customer.hasTrade && deal.customer.tradeVehicle) {
    const fairFloor = deal.customer.tradeVehicle.marketValue * 0.85;
    const wanted = deal.customer.tradeVehicle.marketValue * 0.95;
    tradeAllowance = Math.round(wanted - (wanted - fairFloor) * aggressiveness);
  }

  let outcome: OfferOutcome | null = null;
  let guard = 0;
  while (deal.stage === "negotiating" && guard < 8) {
    guard += 1;
    const terms = buildTerms(price, tradeAllowance, deal.terms.downPayment, deal.terms.termMonths, deal.terms.aprBuyRate, deal.terms.aprSellRate);
    outcome = submitOffer(d, deal, vehicle, terms, rng);
    if (outcome.outcome !== "counter") break;
    price = deal.terms.price;
    tradeAllowance = deal.terms.tradeAllowance;
  }
  return outcome;
}

export function submitOffer(d: Dealership, deal: Deal, vehicle: Vehicle, proposed: FourSquareTerms, rng: Rng): OfferOutcome {
  deal.terms = proposed;
  const result = evaluateOffer(d, deal, vehicle, rng);
  deal.round += 1;
  deal.log.push(result.message);

  if (result.outcome === "accept") {
    deal.stage = "agreed";
  } else if (result.outcome === "walk") {
    deal.stage = "lost";
  } else {
    deal.terms = counterTerms(deal, vehicle, deal.customer);
    deal.log.push(`Counter: price $${deal.terms.price.toLocaleString()}, trade $${deal.terms.tradeAllowance.toLocaleString()}, payment ~$${Math.round(deal.terms.monthlyPayment)}/mo.`);
  }
  return result;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function activeNegotiations(d: Dealership): Deal[] {
  return d.deals.filter((deal) => deal.stage === "negotiating");
}

export function dealsAwaitingFi(d: Dealership): Deal[] {
  return d.deals.filter((deal) => deal.stage === "agreed" || deal.stage === "fi");
}
