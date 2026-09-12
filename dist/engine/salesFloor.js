import { CUSTOMER_FIRST_NAMES, CUSTOMER_LAST_NAMES, TRADE_IN_MODELS } from "../constants.js";
import { nextId } from "../state.js";
import { unitsOnLot } from "./inventory.js";
const MAX_CONCURRENT_DEALS_PER_REP = 2;
export function computeMonthlyPayment(amountFinanced, apr, termMonths) {
    if (amountFinanced <= 0)
        return 0;
    const r = apr / 12;
    if (r <= 0.00001)
        return amountFinanced / termMonths;
    const factor = Math.pow(1 + r, termMonths);
    return (amountFinanced * r * factor) / (factor - 1);
}
export function buildTerms(price, tradeAllowance, downPayment, termMonths, aprBuyRate, aprSellRate) {
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
function creditProfile(rng) {
    const roll = rng.next();
    if (roll < 0.55)
        return { tier: "prime", buyRate: 0.055 };
    if (roll < 0.85)
        return { tier: "nearprime", buyRate: 0.09 };
    return { tier: "subprime", buyRate: 0.155 };
}
function buyRateForTier(tier) {
    if (tier === "prime")
        return 0.055;
    if (tier === "nearprime")
        return 0.09;
    return 0.155;
}
function randomModelClass(d, rng) {
    const lot = unitsOnLot(d);
    if (lot.length === 0)
        return rng.pick(["sedan", "suv", "truck", "coupe", "minivan", "ev"]);
    return rng.pick(lot).model.class;
}
export function generateCustomer(d, day, rng) {
    const credit = creditProfile(rng);
    const hasTrade = rng.chance(0.45);
    const name = `${rng.pick(CUSTOMER_FIRST_NAMES)} ${rng.pick(CUSTOMER_LAST_NAMES)}`;
    return {
        id: nextId("cust"),
        name,
        budgetMonthly: Math.round(rng.range(280, 900)),
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
export function customerTargetPrice(customer, vehicle) {
    if (vehicle.condition === "new") {
        return vehicle.model.invoice + vehicle.model.msrp * 0.012;
    }
    return (vehicle.acquisitionCost + vehicle.reconCost) * 1.04;
}
function leastBusySalesperson(d) {
    const reps = d.staff.filter((s) => s.role === "salesperson");
    if (reps.length === 0)
        return null;
    const load = new Map();
    for (const deal of d.deals) {
        if (deal.salespersonId && (deal.stage === "negotiating" || deal.stage === "agreed" || deal.stage === "fi")) {
            load.set(deal.salespersonId, (load.get(deal.salespersonId) ?? 0) + 1);
        }
    }
    const available = reps.filter((r) => (load.get(r.id) ?? 0) < MAX_CONCURRENT_DEALS_PER_REP);
    if (available.length === 0)
        return null;
    available.sort((a, b) => (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0));
    return available[0];
}
export function dailyUpCount(d, rng) {
    const base = 3 + d.reputation / 22 + Math.min(unitsOnLot(d).length, 30) / 10;
    return Math.max(0, Math.round(rng.gaussian(base, base * 0.25)));
}
function vehiclesInActiveDeals(d) {
    const ids = new Set();
    for (const deal of d.deals) {
        if (deal.stage === "negotiating" || deal.stage === "agreed" || deal.stage === "fi")
            ids.add(deal.vehicleId);
    }
    return ids;
}
export function tryCreateUp(d, day, rng) {
    const reserved = vehiclesInActiveDeals(d);
    const lot = unitsOnLot(d).filter((v) => !reserved.has(v.id));
    if (lot.length === 0)
        return null;
    const rep = leastBusySalesperson(d);
    if (!rep)
        return null;
    const customer = generateCustomer(d, day, rng);
    const matches = lot.filter((v) => v.model.class === customer.interestedModelClass);
    const vehicle = matches.length > 0 ? rng.pick(matches) : rng.pick(lot);
    const target = customerTargetPrice(customer, vehicle);
    const buyRate = buyRateForTier(customer.creditTier);
    const terms = buildTerms(vehicle.listPrice, 0, customer.downPaymentCash, 60, buyRate, buyRate + 0.025);
    const deal = {
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
export function evaluateOffer(d, deal, vehicle, rng) {
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
function counterTerms(deal, vehicle, customer) {
    const target = customerTargetPrice(customer, vehicle);
    const nudgedPrice = Math.round((deal.terms.price + target) / 2);
    let nudgedTrade = deal.terms.tradeAllowance;
    if (customer.hasTrade && customer.tradeVehicle) {
        const wanted = customer.tradeVehicle.marketValue * 0.95;
        nudgedTrade = Math.round((deal.terms.tradeAllowance + wanted) / 2);
    }
    return buildTerms(nudgedPrice, nudgedTrade, deal.terms.downPayment, deal.terms.termMonths, deal.terms.aprBuyRate, deal.terms.aprSellRate);
}
export function submitOffer(d, deal, vehicle, proposed, rng) {
    deal.terms = proposed;
    const result = evaluateOffer(d, deal, vehicle, rng);
    deal.round += 1;
    deal.log.push(result.message);
    if (result.outcome === "accept") {
        deal.stage = "agreed";
    }
    else if (result.outcome === "walk") {
        deal.stage = "lost";
    }
    else {
        deal.terms = counterTerms(deal, vehicle, deal.customer);
        deal.log.push(`Counter: price $${deal.terms.price.toLocaleString()}, trade $${deal.terms.tradeAllowance.toLocaleString()}, payment ~$${Math.round(deal.terms.monthlyPayment)}/mo.`);
    }
    return result;
}
function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}
export function activeNegotiations(d) {
    return d.deals.filter((deal) => deal.stage === "negotiating");
}
export function dealsAwaitingFi(d) {
    return d.deals.filter((deal) => deal.stage === "agreed" || deal.stage === "fi");
}
//# sourceMappingURL=salesFloor.js.map