import type { Dealership, GameState } from "../types.js";
import { Rng } from "../rng.js";
import { isNewMonth, monthLabel } from "./clock.js";
import { autoManageFloorPlan, inventoryBookValue, lotCapacity, tickInventoryDaily } from "./inventory.js";
import { generateDailyServiceJobs, monthlyServiceCycle, processServiceJobs } from "./service.js";
import { autoNegotiateDeal, dailyUpCount, tryCreateUp } from "./salesFloor.js";
import { economyDemandMultiplier, economyMarginMultiplier, economyPriceToleranceMult, economyRateAdj, seasonalTrafficMultiplier, tickEconomyDaily } from "./economy.js";
import { tickHostileTakeoverDaily } from "./hostileTakeover.js";
import { autoRunFi, MAX_FI_DEALS_PER_MANAGER_PER_DAY } from "./fi.js";
import { autoBidAuctionLots, autoOrderAllocation } from "./acquisition.js";
import { monthlyManufacturerCycle } from "./manufacturer.js";
import { monthlyCareerCycle, payOwnerDistribution } from "./career.js";
import { monthlyCaptiveLenderCycle, originateCaptiveLoan } from "./captiveLender.js";
import { monthlyPartsWarehouseCycle, partsUnitCostFor } from "./partsWarehouse.js";
import { liveHouseBrandCatalog, monthlyManufacturerCoCycle, recordHouseBrandShipment, recordOemPartsMargin } from "./manufacturerCo.js";
import { monthlyAcquiredManufacturerCycle, recordAcquiredBrandShipment, recordOemPartsMarginAcquired } from "./manufacturerAcquisition.js";
import { autoRescueDealership, autoSweepDealership } from "./expansion.js";
import { monthlyInsuranceCycle } from "./insurance.js";
import { dailyRandomEventCheck, dailyWeatherCheck, resolveScheduledRipples } from "./randomEvents.js";
import { applyGmStaffManagement, applyMonthlyIncentives, applyMonthlyStaffCycle, applyStaffCareerCycle } from "./staffing.js";
import {
  accruePayroll,
  payAccruedPayroll,
  payFloorPlanInterest,
  postCashExpense,
} from "./financials.js";
import {
  CHARGEBACK_FRACTION,
  CHARGEBACK_MONTHLY_CHANCE,
  CHARGEBACK_WINDOW_MONTHS,
  FACILITY_ASSESSED_VALUE_PER_POINT,
  GENERAL_ADMIN_MONTHLY,
  INCOME_TAX_RATE,
  OCCUPANCY_BASE_MONTHLY,
  OCCUPANCY_PER_FACILITY_POINT,
  PROPERTY_TAX_ANNUAL_RATE,
  UTILITIES_BASE_MONTHLY,
  UTILITIES_PER_BAY_MONTHLY,
  UTILITIES_PER_LOT_CAPACITY_UNIT,
} from "../constants.js";

const MAX_TOASTS = 30;
const STALE_NEGOTIATION_DAYS = 3;

export function pushToast(state: GameState, text: string, kind: "good" | "bad" | "warn" | "info" = "info"): void {
  state.toasts.push({
    id: `${state.day}_${Math.random().toString(36).slice(2, 7)}`,
    text,
    kind,
    day: state.day,
  });
  if (state.toasts.length > MAX_TOASTS) state.toasts.splice(0, state.toasts.length - MAX_TOASTS);
}

function accruePayrollDaily(d: Dealership): void {
  const dailyTotal = d.staff.reduce((sum, s) => sum + s.monthlySalary / 30, 0);
  accruePayroll(d, dailyTotal);
}

function tickDealershipDay(state: GameState, d: Dealership, rng: Rng): void {
  if (d.failure) return;

  // Rescue before anything else runs today: a struggling store's cash
  // crunch is what drives curtailment defaults and floor-plan violations
  // in the first place, so topping it up needs to happen before those
  // daily accruals, not after.
  const rescued = autoRescueDealership(state, d);
  if (rescued > 0) {
    pushToast(state, `${d.name}: rescued with $${Math.round(rescued).toLocaleString()} from the Group Treasury.`, "warn");
  }

  accruePayrollDaily(d);
  for (const s of d.staff) s.experienceDays += 1;
  tickInventoryDaily(d, state.day, rng);
  generateDailyServiceJobs(d, state.day, rng);
  processServiceJobs(d, state.day, rng);

  const curtailmentPaid = autoManageFloorPlan(d);
  if (curtailmentPaid > 0) {
    pushToast(state, `${d.name}: cleared $${Math.round(curtailmentPaid).toLocaleString()} in floor-plan curtailment before it became a problem.`, "good");
  }

  // Allocation runs before auction — protecting the store's own franchise
  // quota comes first. Auction used to go first and, since it can claim up
  // to 5 units/day of finite lot space against a lot that's usually near
  // capacity, it was quietly crowding out new-vehicle allocation entirely
  // on many days. That's academic for a high-quota mainstream brand but
  // existential for a low-quota luxury one: a few months of starved
  // allocation is enough to crater quota attainment and trigger permanent
  // franchise termination, even on a store that looks busy because it's
  // still flipping plenty of off-brand used auction inventory. A rational
  // dealer protects the manufacturer relationship first and treats auction
  // as supplemental, not the other way around.
  if (d.autoPilot.allocation) {
    const houseBrandModels = d.isHouseBrand ? liveHouseBrandCatalog(state.manufacturerCo) : undefined;
    const ordered = autoOrderAllocation(d, state.day, rng, houseBrandModels);
    if (ordered.length > 0) {
      if (d.isHouseBrand) {
        for (const v of ordered) recordHouseBrandShipment(state, v.model);
      }
      if (d.factoryOwned) {
        for (const v of ordered) recordAcquiredBrandShipment(state, v.model);
      }
      if (ordered.length === 1) {
        pushToast(state, `Auto-ordered a ${ordered[0].model.name} ${ordered[0].model.trim} from the factory.`, "good");
      } else {
        pushToast(state, `Auto-ordered ${ordered.length} units from the factory to keep pace with allocation.`, "good");
      }
    }
  }

  if (d.autoPilot.auction) {
    const won = autoBidAuctionLots(d, state.day, rng);
    for (const result of won) {
      if (result.vehicle) {
        pushToast(state, `Auto-bought ${result.vehicle.model.name} ${result.vehicle.model.trim} at auction for $${Math.round(result.finalPrice).toLocaleString()}.`, "good");
      }
    }
  }

  const ups = dailyUpCount(d, rng, economyDemandMultiplier(state) * seasonalTrafficMultiplier(state.day));
  for (let i = 0; i < ups; i++) {
    tryCreateUp(d, state.day, rng, economyRateAdj(state), economyPriceToleranceMult(state), economyMarginMultiplier(state));
  }

  // Checked here, before autopilot resolves today's negotiations, so a
  // test-drive collision can actually see the deal it happened during —
  // autoNegotiateDeal below runs every open negotiation to resolution in
  // the same tick it's created, so activeNegotiations() would always read
  // empty by the end of the day.
  const randomEvent = dailyRandomEventCheck(state, d, rng, state.day);
  if (randomEvent) {
    state.pendingEventModal.push(randomEvent);
  }

  if (d.autoPilot.sales) {
    for (const deal of d.deals) {
      if (deal.stage !== "negotiating") continue;
      const vehicle = d.vehicles.find((v) => v.id === deal.vehicleId);
      if (!vehicle) continue;
      const outcome = autoNegotiateDeal(d, deal, vehicle, rng);
      const repName = d.staff.find((s) => s.id === deal.salespersonId)?.name ?? "your rep";
      if (outcome?.outcome === "accept") {
        pushToast(state, `${repName} closed ${deal.customer.name} at $${Math.round(deal.terms.price).toLocaleString()}.`, "good");
      } else if (outcome?.outcome === "walk") {
        pushToast(state, `${deal.customer.name} walked away from ${repName}.`, "warn");
      }
    }
  }

  if (d.autoPilot.fi) {
    // A finance appointment is a real sit-down, not an instant rubber
    // stamp — capacity is bounded by how many F&I managers are actually on
    // staff (see MAX_FI_DEALS_PER_MANAGER_PER_DAY), so a backlog can pile
    // up in "Awaiting F&I" and genuinely pressure the player to hire a
    // second manager rather than one person clearing an unlimited queue.
    const fiCapacity = d.staff.filter((s) => s.role === "fi_manager").length * MAX_FI_DEALS_PER_MANAGER_PER_DAY;
    const pending = d.deals
      .filter((deal) => deal.stage === "agreed" || deal.stage === "fi")
      .sort((a, b) => a.createdDay - b.createdDay); // oldest-waiting first, so a backlog never starves any one deal indefinitely
    let processed = 0;
    for (const deal of pending) {
      if (processed >= fiCapacity) break;
      const vehicle = d.vehicles.find((v) => v.id === deal.vehicleId);
      if (!vehicle) continue;
      autoRunFi(d, deal, vehicle, state.day, rng, economyMarginMultiplier(state));
      originateCaptiveLoan(state, deal);
      pushToast(state, `F&I closed ${deal.customer.name}'s deal. Total gross $${Math.round(deal.frontEndGross + deal.fiGross).toLocaleString()}.`, "good");
      processed++;
    }
  }

  for (const deal of d.deals) {
    if (deal.stage === "negotiating" && state.day - deal.createdDay > STALE_NEGOTIATION_DAYS) {
      deal.stage = "lost";
      deal.log.push(`${deal.customer.name} lost interest and left.`);
    }
  }
  d.deals = d.deals.filter((deal) => !(
    (deal.stage === "closed" || deal.stage === "lost") && state.day - deal.createdDay > 14
  ));

  if (d.failure) {
    pushToast(state, `${d.name}: the floor-plan lender has swept unpaid inventory. The line is pulled.`, "bad");
  }
}

/** Live gross profit for the month so far. d.currentMonth.totalGrossProfit only gets its final value once, at month-end inside finalizeMonth (then the whole object resets to zero) — anything rendered mid-month needs to sum the accumulating line items directly instead. */
export function monthToDateGrossProfit(d: Dealership): number {
  return d.currentMonth.frontEndGross + d.currentMonth.fiGross + d.currentMonth.serviceGross + d.currentMonth.partsGross;
}

/**
 * Live net income for the month so far, same formula finalizeMonth uses,
 * applied to whatever's accumulated up to right now. d.currentMonth.netIncome
 * itself is useless for a running "MTD Net" display: it's written once, at
 * month-end, and the object holding it is replaced with a fresh zeroed one
 * a few lines later in that same synchronous call — so the UI never
 * actually observes a nonzero value there. The lump month-end-only items
 * (overhead/occupancy/property tax/utilities/income tax) correctly read as
 * 0 here until the month actually closes and posts them, same as a real
 * business's books mid-month.
 */
export function monthToDateNetIncome(d: Dealership): number {
  const m = d.currentMonth;
  return monthToDateGrossProfit(d)
    + m.holdbackIncome
    - m.payrollExpense
    - m.floorPlanInterestExpense
    - m.overheadExpense
    - m.occupancyExpense
    - m.propertyTaxExpense
    - m.utilitiesExpense
    - m.curtailmentPenalties
    - m.incentiveExpense
    - m.chargebackExpense
    - m.insurancePremiumExpense
    - m.incomeTaxExpense;
}

function finalizeMonth(state: GameState, d: Dealership, rng: Rng): number {
  // Real, separately-scaling operating costs instead of one flat
  // "overhead" number — occupancy and utilities grow with how built-out
  // the facility is (the same facilityStandards stat that already drives
  // lot capacity and sales-floor headcount), and property tax is a genuine
  // ad-valorem levy on assessed real estate + inventory value. None of
  // this moved with the store's own size or success before.
  const generalAdmin = GENERAL_ADMIN_MONTHLY;
  const occupancy = OCCUPANCY_BASE_MONTHLY + d.manufacturer.facilityStandards * OCCUPANCY_PER_FACILITY_POINT;
  const assessedValue = inventoryBookValue(d) + d.manufacturer.facilityStandards * FACILITY_ASSESSED_VALUE_PER_POINT;
  const propertyTax = (assessedValue * PROPERTY_TAX_ANNUAL_RATE) / 12;
  const utilities = UTILITIES_BASE_MONTHLY + d.service.bays * UTILITIES_PER_BAY_MONTHLY + lotCapacity(d) * UTILITIES_PER_LOT_CAPACITY_UNIT;
  postCashExpense(d, generalAdmin);
  postCashExpense(d, occupancy);
  postCashExpense(d, propertyTax);
  postCashExpense(d, utilities);
  d.currentMonth.overheadExpense = generalAdmin;
  d.currentMonth.occupancyExpense = occupancy;
  d.currentMonth.propertyTaxExpense = propertyTax;
  d.currentMonth.utilitiesExpense = utilities;
  d.currentMonth.insurancePremiumExpense = monthlyInsuranceCycle(d, state.day);

  payAccruedPayroll(d);
  payFloorPlanInterest(d);

  // F&I chargebacks: each open deal carries a flat monthly chance of an
  // early loan payoff or product cancellation clawing back part of its
  // booked F&I gross. Each exposure resolves at most once — charged back
  // (removed) or aged past the risk window (also removed) — so a deal is
  // never charged twice.
  let chargebackTotal = 0;
  const survivingExposure: Dealership["fiChargebackExposure"] = [];
  for (const exposure of d.fiChargebackExposure) {
    if (rng.chance(CHARGEBACK_MONTHLY_CHANCE)) {
      chargebackTotal += exposure.fiGrossAtRisk * CHARGEBACK_FRACTION;
      continue;
    }
    exposure.monthsElapsed += 1;
    if (exposure.monthsElapsed < CHARGEBACK_WINDOW_MONTHS) survivingExposure.push(exposure);
  }
  d.fiChargebackExposure = survivingExposure;
  if (chargebackTotal > 0) postCashExpense(d, chargebackTotal);
  d.currentMonth.chargebackExpense = chargebackTotal;

  d.currentMonth.totalGrossProfit =
    d.currentMonth.frontEndGross + d.currentMonth.fiGross + d.currentMonth.serviceGross + d.currentMonth.partsGross;
  const preTaxPreIncentiveNetIncome =
    d.currentMonth.totalGrossProfit +
    d.currentMonth.holdbackIncome -
    d.currentMonth.payrollExpense -
    d.currentMonth.floorPlanInterestExpense -
    d.currentMonth.overheadExpense -
    d.currentMonth.occupancyExpense -
    d.currentMonth.propertyTaxExpense -
    d.currentMonth.utilitiesExpense -
    d.currentMonth.curtailmentPenalties -
    d.currentMonth.incentiveExpense - // aged-unit spiffs, already paid out during the month
    d.currentMonth.chargebackExpense -
    d.currentMonth.insurancePremiumExpense;

  // Top-performer, service-pool, and GM bonuses are read from this month's
  // deal/gross counters, so this must run before applyMonthlyStaffCycle
  // resets them — and before netIncome is finalized, so the payout counts.
  // Bonuses are based on pretax performance, same as real store-level
  // incentive plans — income tax is a whole-entity concern, applied after.
  const incentives = applyMonthlyIncentives(d, preTaxPreIncentiveNetIncome);
  d.currentMonth.incentiveExpense += incentives.total;
  const preTaxNetIncome = preTaxPreIncentiveNetIncome - incentives.total;

  // The single biggest thing missing before: every dollar of profit went
  // straight to the owner, tax-free. A real business pays income tax on
  // what it actually earns.
  const incomeTax = preTaxNetIncome > 0 ? preTaxNetIncome * INCOME_TAX_RATE : 0;
  if (incomeTax > 0) postCashExpense(d, incomeTax);
  d.currentMonth.incomeTaxExpense = incomeTax;
  d.currentMonth.netIncome = preTaxNetIncome - incomeTax;
  d.currentMonth.csiAvgScore = d.manufacturer.csi;
  // incentivesThisMonth gets reset per-staff below (new month starting), so
  // this toast is the only place these payouts are ever visible to the player.
  for (const award of incentives.awards) {
    pushToast(state, `${d.name} — ${award.label}: ${award.name} earned $${award.amount.toLocaleString()}.`, "good");
  }

  const ownerDistribution = payOwnerDistribution(state, d);
  if (ownerDistribution > 0) {
    pushToast(state, `${d.name}: paid you a $${Math.round(ownerDistribution).toLocaleString()} owner distribution on your ${Math.round(state.career.equityPct * 100)}% stake.`, "good");
  }

  d.monthlyHistory.push(d.currentMonth);
  if (d.monthlyHistory.length > 36) d.monthlyHistory.shift();

  // A house-brand dealership can't be terminated by itself, so it skips the
  // whole real-franchise tier/quota/compliance grind entirely — its
  // allocation cap instead comes from monthlyManufacturerCoCycle below. A
  // factory-owned dealership (the player bought this franchise's real
  // manufacturing outright and kept it independent) skips it for the same
  // reason — you can't be terminated by your own factory either.
  if (!d.isHouseBrand && !d.factoryOwned) monthlyManufacturerCycle(d, state.day);
  const unitsRestocked = monthlyServiceCycle(d, partsUnitCostFor(state));
  applyMonthlyStaffCycle(d);

  const careerEvents = applyStaffCareerCycle(state, d, rng);
  for (const event of careerEvents) {
    if (event.kind === "retired") {
      pushToast(state, `${d.name}: ${event.member.name} retired after ${Math.floor(event.member.experienceDays / 365)} years with you.`, "info");
    } else if (event.kind === "poached") {
      pushToast(state, `${d.name}: ${event.member.name} was poached by a rival lot — morale had been slipping for a while.`, "bad");
    } else if (event.kind === "promoted") {
      pushToast(state, `${d.name}: ${event.member.name} was promoted to General Manager after working the floor for ${Math.floor(event.member.experienceDays / 365)} years.`, "good");
    } else if (event.kind === "backfilled") {
      pushToast(state, `${d.name}: your GM hired ${event.member.name} to fill an open seat.`, "good");
    }
  }

  const gmResult = applyGmStaffManagement(d, rng);
  for (const member of gmResult.trained) {
    pushToast(state, `${d.name}: your GM sent ${member.name} for training — skill improved.`, "good");
  }
  for (const member of gmResult.raised) {
    pushToast(state, `${d.name}: your GM gave ${member.name} a raise to $${Math.round(member.monthlySalary * 12).toLocaleString()}/yr after a sustained run of earning it.`, "good");
  }
  for (const member of gmResult.hiredServiceTechs) {
    pushToast(state, `${d.name}: your GM hired ${member.name} as a service tech — the shop's been backed up for too long.`, "good");
  }
  if (gmResult.investedInBay) {
    pushToast(state, `${d.name}: your GM added a service bay to work through the backlog.`, "good");
  }

  for (const stat of Object.values(d.modelStats)) {
    stat.unitsSoldLastMonth = stat.unitsSoldThisMonth;
    stat.unitsSoldThisMonth = 0;
    stat.grossThisMonth = 0;
  }

  d.currentMonth = {
    monthLabel: monthLabel(state.day),
    frontEndGross: 0,
    fiGross: 0,
    serviceGross: 0,
    partsGross: 0,
    totalGrossProfit: 0,
    payrollExpense: 0,
    floorPlanInterestExpense: 0,
    overheadExpense: 0,
    occupancyExpense: 0,
    propertyTaxExpense: 0,
    utilitiesExpense: 0,
    incomeTaxExpense: 0,
    curtailmentPenalties: 0,
    incentiveExpense: 0,
    holdbackIncome: 0,
    chargebackExpense: 0,
    insurancePremiumExpense: 0,
    netIncome: 0,
    unitsSoldNew: 0,
    unitsSoldUsed: 0,
    csiAvgScore: d.manufacturer.csi,
  };

  return unitsRestocked;
}

export function advanceOneDay(state: GameState, rng: Rng): void {
  state.day += 1;

  const econTick = tickEconomyDaily(state, rng);
  if (econTick.eraChanged) {
    const era = econTick.eraChanged;
    const good = era.demandMult >= 1 && era.rateAdj <= 0;
    pushToast(state, `Market update: ${era.headline} — ${era.description}`, good ? "good" : "warn");
  }

  const takeoverTick = tickHostileTakeoverDaily(state, rng);
  if (takeoverTick.started) {
    const t = takeoverTick.started;
    const targetName = state.dealerships[t.targetDealershipId]?.name ?? "a dealership";
    const scopeText = t.scope === "group" ? "is making a play for your flagship store" : "is circling one of your weaker stores";
    pushToast(state, `${t.rivalName} ${scopeText}, ${targetName} — defend it for $${Math.round(t.defendCost).toLocaleString()} or lose it to a forced sale in ${t.deadlineDay - t.startDay} days.`, "warn");
    // Losing a whole dealership to a missed toast at 15x speed is a much
    // worse outcome than the interruption of pausing — same reasoning
    // behind pausing for the ownership milestone, and arguably higher
    // stakes here since this one's on a real clock and fully reversible
    // only if the player actually notices in time.
    state.speed = 0;
  }
  if (takeoverTick.lost) {
    pushToast(state, `${takeoverTick.lost.rivalName} forced the sale of ${takeoverTick.lost.dealershipName} for $${Math.round(takeoverTick.lost.forcedPrice).toLocaleString()} — well below what it was worth.`, "bad");
  }

  // A primary event (not a ripple) is rare enough, and genuinely
  // surprising enough, to earn the same "you have to look at this" modal
  // treatment as a career milestone — a toast alone is too easy to miss at
  // higher speeds. Ripples are a continuation of a story the player already
  // saw the modal for, so they stay a toast.
  for (const weatherEvent of dailyWeatherCheck(state, rng, state.day)) {
    state.pendingEventModal.push(weatherEvent);
  }
  for (const ripple of resolveScheduledRipples(state, rng, state.day)) {
    pushToast(state, ripple.headline, ripple.lossAmount > 0 || ripple.kind === "recall_compliance_strike" ? "bad" : "warn");
  }

  for (const id of Object.keys(state.dealerships)) {
    tickDealershipDay(state, state.dealerships[id], rng);
  }

  if (isNewMonth(state.day)) {
    let groupUnitsRestocked = 0;
    let groupHouseBrandUnitsRestocked = 0;
    let groupFactoryOwnedUnitsRestocked = 0;
    for (const id of Object.keys(state.dealerships)) {
      const d = state.dealerships[id];
      const unitsRestocked = finalizeMonth(state, d, rng);
      groupUnitsRestocked += unitsRestocked;
      if (d.isHouseBrand) groupHouseBrandUnitsRestocked += unitsRestocked;
      else if (d.factoryOwned) groupFactoryOwnedUnitsRestocked += unitsRestocked;
      const justFinalized = d.monthlyHistory[d.monthlyHistory.length - 1];
      pushToast(
        state,
        `${d.name} — ${justFinalized.monthLabel}: net ${justFinalized.netIncome >= 0 ? "profit" : "loss"} of $${Math.abs(Math.round(justFinalized.netIncome)).toLocaleString()}.`,
        justFinalized.netIncome >= 0 ? "good" : "warn",
      );
      // Sweep any surplus above this store's own working-capital threshold
      // now that its month is fully closed out (overhead/payroll/floor-plan
      // interest already paid) — leaves what it needs to run itself.
      const cashBeforeSweep = d.ledger.cash;
      autoSweepDealership(state, d);
      const swept = cashBeforeSweep - d.ledger.cash;
      if (swept > 0) {
        pushToast(state, `${d.name}: swept $${Math.round(swept).toLocaleString()} to the Group Treasury.`, "good");
      }
    }
    monthlyCareerCycle(state, state.day);
    if (state.career.milestoneOfferPending) {
      pushToast(state, "A real opportunity has come up — check your Career milestone.", "good");
    }

    const captiveInterest = monthlyCaptiveLenderCycle(state);
    if (captiveInterest > 0) {
      pushToast(state, `Captive Lender: $${Math.round(captiveInterest).toLocaleString()} interest income earned on your $${Math.round(state.captiveLender.portfolioPrincipal).toLocaleString()} loan portfolio.`, "good");
    }

    monthlyPartsWarehouseCycle(state, groupUnitsRestocked);
    if (state.partsWarehouse.chartered && (state.partsWarehouse.lastMonthExternalProfit > 0 || state.partsWarehouse.lastMonthInternalSavings > 0)) {
      pushToast(state, `Parts Warehouse: saved your group $${Math.round(state.partsWarehouse.lastMonthInternalSavings).toLocaleString()} on restocking and earned $${Math.round(state.partsWarehouse.lastMonthExternalProfit).toLocaleString()} distributing to outside shops.`, "good");
    }
    // The warehouse is also the OEM parts channel for anything you
    // manufacture yourself — only realized once it's actually chartered,
    // same reasoning a real automaker's parts division runs through its own
    // distribution network rather than selling direct to each store.
    if (state.partsWarehouse.chartered) {
      recordOemPartsMargin(state, groupHouseBrandUnitsRestocked);
      recordOemPartsMarginAcquired(state, groupFactoryOwnedUnitsRestocked);
    }

    monthlyManufacturerCoCycle(state);
    if (state.manufacturerCo.founded && state.manufacturerCo.lastMonthProfit > 0) {
      pushToast(state, `${state.manufacturerCo.brandName}: shipped ${state.manufacturerCo.lastMonthUnitsShipped} unit${state.manufacturerCo.lastMonthUnitsShipped === 1 ? "" : "s"} to your dealerships, earning $${Math.round(state.manufacturerCo.lastMonthProfit).toLocaleString()} in manufacturing profit.`, "good");
    }

    monthlyAcquiredManufacturerCycle(state);
    const am = state.acquiredManufacturer;
    if (am?.owned && !am.mergedIntoOwnBrand && am.lastMonthProfit > 0) {
      pushToast(state, `${am.brand}: your factory shipped ${am.lastMonthUnitsShipped} unit${am.lastMonthUnitsShipped === 1 ? "" : "s"}, earning $${Math.round(am.lastMonthProfit).toLocaleString()} in manufacturing profit.`, "good");
    }
  }

  state.rngState = rng.getState();
}
