import { buildTerms } from "./salesFloor.js";
import { closeDeal } from "./dealClose.js";
const PRODUCT_DEFS = [
    { key: "warranty", label: "Extended Service Contract", priceFrac: 0.055, costFrac: 0.55 },
    { key: "gap", label: "GAP Insurance", priceFrac: 0.012, costFrac: 0.35 },
    { key: "maintenance", label: "Prepaid Maintenance", priceFrac: 0.018, costFrac: 0.5 },
    { key: "aftermarket", label: "Aftermarket Package (paint/fabric/accessories)", priceFrac: 0.02, costFrac: 0.4 },
];
export function enterFi(deal) {
    deal.stage = "fi";
}
export function buildFiMenu(vehicle) {
    return PRODUCT_DEFS.map((p) => ({
        key: p.key,
        label: p.label,
        price: Math.round(vehicle.listPrice * p.priceFrac / 10) * 10,
        cost: Math.round(vehicle.listPrice * p.priceFrac * p.costFrac / 10) * 10,
        attached: false,
        pitched: false,
    }));
}
export function setFinanceMarkup(deal, markupApr) {
    const clamped = Math.max(0, Math.min(0.03, markupApr));
    deal.terms = buildTerms(deal.terms.price, deal.terms.tradeAllowance, deal.terms.downPayment, deal.terms.termMonths, deal.terms.aprBuyRate, deal.terms.aprBuyRate + clamped);
}
export function estimateFinanceReserve(deal) {
    const amountFinanced = Math.max(0, deal.terms.price - deal.terms.tradeAllowance - deal.terms.downPayment);
    const spread = deal.terms.aprSellRate - deal.terms.aprBuyRate;
    const termYears = deal.terms.termMonths / 12;
    return Math.max(0, amountFinanced * spread * termYears * 0.55);
}
function fiManagerSkill(d, deal) {
    const mgr = d.staff.find((s) => s.role === "fi_manager");
    return mgr ? mgr.skill : 40;
}
export function pitchProduct(d, deal, productKey, rng) {
    const product = deal.fiProducts.find((p) => p.key === productKey);
    if (!product)
        return false;
    const skill = fiManagerSkill(d, deal);
    const creditPenalty = deal.customer.creditTier === "subprime" ? 0.12 : deal.customer.creditTier === "nearprime" ? 0.04 : 0;
    const priceBurden = product.price / Math.max(1, deal.terms.price);
    const chance = clamp(0.28 + (skill / 100) * 0.4 - creditPenalty - priceBurden * 1.2, 0.05, 0.85);
    const attached = rng.chance(chance);
    product.attached = attached;
    product.pitched = true;
    return attached;
}
export function finalizeFiAndClose(d, deal, vehicle, day, rng) {
    const reserve = estimateFinanceReserve(deal);
    deal.financeReserve = reserve;
    const productsProfit = deal.fiProducts.filter((p) => p.attached).reduce((sum, p) => sum + (p.price - p.cost), 0);
    deal.fiGross = reserve + productsProfit;
    const mgr = d.staff.find((s) => s.role === "fi_manager");
    if (mgr) {
        mgr.dealsThisMonth += 1;
        mgr.grossThisMonth += deal.fiGross;
    }
    closeDeal(d, deal, vehicle, day, rng);
}
function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}
//# sourceMappingURL=fi.js.map