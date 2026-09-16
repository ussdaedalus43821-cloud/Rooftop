import { Rng } from "./rng.js";
import { newCaptiveLender } from "./engine/captiveLender.js";
import { newPartsWarehouse } from "./engine/partsWarehouse.js";
import { newManufacturerCo } from "./engine/manufacturerCo.js";
import { newEconomyState } from "./engine/economy.js";
import { newInsuranceState } from "./engine/insurance.js";
import {
  CURTAILMENT_FRACTION,
  CURTAILMENT_GRACE_DAYS,
  CURTAILMENT_INTERVAL_DAYS,
  CURTAILMENT_THRESHOLD_DAYS,
  FLOORPLAN_DAILY_RATE,
  getFranchiseOption,
  STAFF_FIRST_NAMES,
  STAFF_LAST_NAMES,
} from "./constants.js";
import type {
  CareerState,
  Dealership,
  FranchiseKey,
  GameSettings,
  GameState,
  MonthlyFinancials,
  StaffMember,
} from "./types.js";

// The counter alone would restart at 1 on every page load/reload, so IDs
// generated in a fresh session could collide with (and silently overwrite)
// entities already in a loaded save. Mixing in a random per-session prefix
// makes that collision astronomically unlikely without needing to scan the
// loaded state for the highest existing id.
const sessionTag = Math.floor(Math.random() * 36 ** 6).toString(36);
let idCounter = 0;
export function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${sessionTag}${idCounter.toString(36)}`;
}

function emptyMonth(label: string): MonthlyFinancials {
  return {
    monthLabel: label,
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
    csiAvgScore: 80,
  };
}

function makeStaff(rng: Rng, role: StaffMember["role"], skill: number, salary: number, commission?: number): StaffMember {
  const name = `${rng.pick(STAFF_FIRST_NAMES)} ${rng.pick(STAFF_LAST_NAMES)}`;
  return {
    id: nextId("staff"),
    name,
    role,
    skill,
    experienceDays: rng.int(30, 900),
    morale: rng.int(55, 85),
    monthlySalary: salary,
    commissionRate: commission,
    dealsThisMonth: 0,
    grossThisMonth: 0,
    incentivesThisMonth: 0,
    meritStreak: 0,
    raisesReceived: 0,
  };
}

export function createDealership(rng: Rng, id: string, name: string, franchiseKey: FranchiseKey, foundedDay: number, startingCapital?: number): Dealership {
  const option = getFranchiseOption(franchiseKey);
  const brand = option.brand;
  const capital = startingCapital ?? option.startingCash;
  const noFranchise = option.baseQuota === 0; // e.g. Carvana: used-only, no manufacturer relationship at all
  const staff: StaffMember[] = [
    makeStaff(rng, "salesperson", 55, 2400, 0.2),
    makeStaff(rng, "salesperson", 45, 2200, 0.2),
    makeStaff(rng, "salesperson", 65, 2600, 0.22),
    makeStaff(rng, "fi_manager", 60, 3800, 0.08),
    makeStaff(rng, "service_advisor", 55, 3200),
    makeStaff(rng, "service_tech", 60, 3400),
    makeStaff(rng, "service_tech", 50, 3100),
  ];

  return {
    id,
    name,
    brand,
    foundedDay,
    vehicles: [],
    staff,
    deals: [],
    activeCustomers: [],
    manufacturer: {
      brand,
      franchiseKey,
      tier: "silver",
      quotaUnitsMonthly: Math.round(option.baseQuota * 0.7),
      quotaAttainedThisMonth: 0,
      allocationCapMonthly: option.baseQuota,
      allocationOrderedThisMonth: 0,
      csi: 78,
      facilityStandards: 72,
      complianceStrikes: 0,
      tierHistory: [{ day: foundedDay, tier: "silver" }],
      terminated: noFranchise,
      monthsBelowThreshold: 0,
    },
    floorPlan: {
      dailyRate: FLOORPLAN_DAILY_RATE,
      curtailmentThresholdDays: CURTAILMENT_THRESHOLD_DAYS,
      curtailmentIntervalDays: CURTAILMENT_INTERVAL_DAYS,
      curtailmentFraction: CURTAILMENT_FRACTION,
      curtailmentGraceDays: CURTAILMENT_GRACE_DAYS,
      accruedInterestPayable: 0,
      outstandingCurtailmentDue: 0,
      violationSeverity: 0,
      holdPayoffs: false,
      auditFailed: false,
      monthsSinceAudit: 0,
    },
    insurance: newInsuranceState(),
    service: {
      bays: 4,
      techs: staff.filter((s) => s.role === "service_tech"),
      advisors: staff.filter((s) => s.role === "service_advisor"),
      warrantyRate: 62,
      customerPayRate: 129,
      retentionRate: 0.42,
      jobs: [],
      parts: {
        stockedValue: 22000,
        stockedUnits: 400,
        targetStockUnits: 500,
        fillRate: 0.72,
        specialOrderDelayDays: 3,
      },
      csiContribution: 0,
      monthlyCustomerPayGross: 0,
      monthlyWarrantyGross: 0,
      monthlyPartsGross: 0,
    },
    ledger: {
      cash: capital,
      vehicleInventoryValue: 0,
      partsInventoryValue: 22000,
      floorPlanPayable: 0,
      accountsPayable: 0,
      ownerEquityContributed: option.startingOwnerEquity,
      retainedEarnings: capital + 22000 - option.startingOwnerEquity,
    },
    monthlyHistory: [],
    currentMonth: emptyMonth("Month 1"),
    fiChargebackExposure: [],
    reputation: 58,
    serviceCustomerBase: 120,
    isUsedOnly: noFranchise,
    failure: null,
    autoPilot: { sales: false, fi: false, auction: false, allocation: false, treasury: false },
    autoSweepThreshold: 100_000,
    auctionAutoBidDiscountPct: 10,
    auctionLots: [],
    auctionLotsDay: -1,
    modelStats: {},
    isHouseBrand: false,
    factoryOwned: false,
  };
}

function newCareer(): CareerState {
  return {
    role: "gm",
    equityPct: 0,
    equityDealershipId: null,
    lifetimeDistributions: 0,
    bonusPoolAccrued: 0,
    consecutiveStrongMonths: 0,
    monthsEmployed: 0,
    milestoneOfferPending: false,
    milestoneResolved: false,
    performanceHistory: [],
  };
}

function newSettings(): GameSettings {
  return {
    autoSaveEnabled: true,
  };
}

export function createNewGame(seed: number = Date.now(), franchiseKey: FranchiseKey = "ford"): GameState {
  const rng = new Rng(seed);
  const dealershipId = nextId("dlr");
  const brand = getFranchiseOption(franchiseKey).brand;
  const dealership = createDealership(rng, dealershipId, `Meridian Point ${brand}`, franchiseKey, 0);

  return {
    version: 1,
    seed,
    rngState: rng.getState(),
    day: 0,
    speed: 1,
    realMsAccumulator: 0,
    dealerships: { [dealershipId]: dealership },
    activeDealershipId: dealershipId,
    career: newCareer(),
    settings: newSettings(),
    activeTab: "overview",
    toasts: [],
    gameOver: null,
    lastSavedDay: 0,
    acquisitionTargets: [],
    acquisitionTargetsMonth: -1,
    groupTreasury: 0,
    captiveLender: newCaptiveLender(),
    partsWarehouse: newPartsWarehouse(),
    manufacturerCo: newManufacturerCo(),
    economy: newEconomyState(),
    acquiredManufacturer: null,
    manufacturerAcquisitionTargets: [],
    manufacturerAcquisitionTargetsMonth: -1,
    takeoverThreat: null,
  };
}
