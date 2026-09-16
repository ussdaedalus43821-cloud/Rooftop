import type { Deal, Dealership, FiProductOffer, StaffMember, Vehicle } from "../types.js";
import { Rng } from "../rng.js";
import { buildTerms } from "./salesFloor.js";
import { closeDeal } from "./dealClose.js";
import { postGrossProfit } from "./financials.js";

const PRODUCT_DEFS: { key: FiProductOffer["key"]; label: string; priceFrac: number; costFrac: number }[] = [
  { key: "warranty", label: "Extended Service Contract", priceFrac: 0.055, costFrac: 0.55 },
  { key: "gap", label: "GAP Insurance", priceFrac: 0.012, costFrac: 0.35 },
  { key: "maintenance", label: "Prepaid Maintenance", priceFrac: 0.018, costFrac: 0.5 },
  { key: "aftermarket", label: "Aftermarket Package (paint/fabric/accessories)", priceFrac: 0.02, costFrac: 0.4 },
];

/** Whichever F&I manager has closed the fewest deals this month — keeps work (and credit) spread across everyone hired instead of always landing on the same one. */
function pickFiManager(d: Dealership): StaffMember | null {
  const mgrs = d.staff.filter((s) => s.role === "fi_manager");
  if (mgrs.length === 0) return null;
  return [...mgrs].sort((a, b) => a.dealsThisMonth - b.dealsThisMonth)[0];
}

// A finance appointment is a real, unhurried sit-down — paperwork, product
// pitches, a credit conversation — not an instant rubber stamp. Nothing
// used to cap how many one manager could close in a single day, so a lone
// F&I manager could clear an entire sales floor's worth of deals with zero
// bottleneck, no matter how many salespeople were feeding them. This caps
// daily throughput per manager, same spirit as the sales floor's own
// concurrent-deal limit — a store that outgrows its F&I capacity needs to
// actually hire a second manager, not just watch one person do the
// impossible.
export const MAX_FI_DEALS_PER_MANAGER_PER_DAY = 4;

export function enterFi(d: Dealership, deal: Deal): void {
  if (!deal.fiManagerId) {
    const mgr = pickFiManager(d);
    if (mgr) deal.fiManagerId = mgr.id;
  }
  deal.stage = "fi";
}

export function buildFiMenu(vehicle: Vehicle): FiProductOffer[] {
  return PRODUCT_DEFS.map((p) => ({
    key: p.key,
    label: p.label,
    price: Math.round(vehicle.listPrice * p.priceFrac / 10) * 10,
    cost: Math.round(vehicle.listPrice * p.priceFrac * p.costFrac / 10) * 10,
    attached: false,
    pitched: false,
  }));
}

// Pre-2013, dealer reserve markup was largely uncapped in practice. The
// 2013 CFPB/Ally Financial settlement and the broad industry shift that
// followed pushed most lenders toward a flat fee or a tight cap on dealer
// participation — commonly around 200bps — instead of whatever markup a
// buyer would tolerate. 300bps was the old, pre-regulatory ceiling here.
export function setFinanceMarkup(deal: Deal, markupApr: number): void {
  const clamped = Math.max(0, Math.min(0.02, markupApr));
  deal.terms = buildTerms(
    deal.terms.price,
    deal.terms.tradeAllowance,
    deal.terms.downPayment,
    deal.terms.termMonths,
    deal.terms.aprBuyRate,
    deal.terms.aprBuyRate + clamped,
  );
}

// The dealer's actual cut of the rate spread it marks up — also tightened
// post-2013 as lenders moved to capped participation agreements rather
// than passing through the full markup.
const RESERVE_PARTICIPATION_RATE = 0.45;

export function estimateFinanceReserve(deal: Deal): number {
  const amountFinanced = Math.max(0, deal.terms.price - deal.terms.tradeAllowance - deal.terms.downPayment);
  const spread = deal.terms.aprSellRate - deal.terms.aprBuyRate;
  const termYears = deal.terms.termMonths / 12;
  return Math.max(0, amountFinanced * spread * termYears * RESERVE_PARTICIPATION_RATE);
}

function fiManagerSkill(d: Dealership, deal: Deal): number {
  const mgr = deal.fiManagerId ? d.staff.find((s) => s.id === deal.fiManagerId) : undefined;
  return mgr ? mgr.skill : 40;
}

export function pitchProduct(d: Dealership, deal: Deal, productKey: FiProductOffer["key"], rng: Rng): boolean {
  const product = deal.fiProducts.find((p) => p.key === productKey);
  if (!product) return false;
  const skill = fiManagerSkill(d, deal);
  const creditPenalty = deal.customer.creditTier === "subprime" ? 0.12 : deal.customer.creditTier === "nearprime" ? 0.04 : 0;
  const priceBurden = product.price / Math.max(1, deal.terms.price);
  const chance = clamp(0.28 + (skill / 100) * 0.4 - creditPenalty - priceBurden * 1.2, 0.05, 0.85);
  const attached = rng.chance(chance);
  product.attached = attached;
  product.pitched = true;
  return attached;
}

/**
 * Let a hired F&I manager run the desk end-to-end using their own skill,
 * instead of requiring the player to set the markup and pitch every
 * product by hand. A skilled manager pushes the reserve markup harder and
 * pitches every product on the menu, then closes the deal.
 */
export function autoRunFi(d: Dealership, deal: Deal, vehicle: Vehicle, day: number, rng: Rng, marginMult: number = 1): void {
  if (deal.stage === "agreed") enterFi(d, deal);
  if (deal.fiProducts.length === 0) deal.fiProducts = buildFiMenu(vehicle);

  const skill = fiManagerSkill(d, deal);
  const markup = clamp(0.003 + (skill / 100) * 0.015, 0, 0.02);
  setFinanceMarkup(deal, markup);

  for (const product of deal.fiProducts) {
    if (!product.pitched) pitchProduct(d, deal, product.key, rng);
  }

  finalizeFiAndClose(d, deal, vehicle, day, rng, marginMult);
}

/** marginMult (from economy.ts's economyMarginMultiplier — same downturn signal that compresses front-end price) thins the reserve/product markup in soft economic conditions: lenders offer less room on rate, buyers cut extras, and dealers can't push as hard. Defaults to 1 for the manual F&I-tab path where no economy context is threaded through yet. */
export function finalizeFiAndClose(d: Dealership, deal: Deal, vehicle: Vehicle, day: number, rng: Rng, marginMult: number = 1): void {
  const reserve = estimateFinanceReserve(deal);
  deal.financeReserve = reserve;
  const productsProfit = deal.fiProducts.filter((p) => p.attached).reduce((sum, p) => sum + (p.price - p.cost), 0);
  deal.fiGross = (reserve + productsProfit) * marginMult;
  // Every other gross-profit source (front-end, service, parts, holdback)
  // books to cash+equity the moment it's earned — this was the one
  // exception, silently missing. Reported net income already counted
  // fiGross as revenue (and taxed/bonused against it) whether or not the
  // ledger ever actually received it, so the store's real cash position was
  // quietly bleeding relative to what the P&L showed.
  postGrossProfit(d, deal.fiGross);

  const mgr = deal.fiManagerId ? d.staff.find((s) => s.id === deal.fiManagerId) : undefined;
  if (mgr) {
    mgr.dealsThisMonth += 1;
    mgr.grossThisMonth += deal.fiGross;
  }

  closeDeal(d, deal, vehicle, day, rng);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
