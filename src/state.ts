import { Rng } from "./rng.js";
import {
  CURTAILMENT_FRACTION,
  CURTAILMENT_GRACE_DAYS,
  CURTAILMENT_INTERVAL_DAYS,
  CURTAILMENT_THRESHOLD_DAYS,
  FLOORPLAN_DAILY_RATE,
  OVERHEAD_MONTHLY,
  STAFF_FIRST_NAMES,
  STAFF_LAST_NAMES,
  STARTING_CASH,
  STARTING_OWNER_EQUITY,
} from "./constants.js";
import type {
  CareerState,
  Dealership,
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
    curtailmentPenalties: 0,
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
  };
}

export function createDealership(rng: Rng, id: string, name: string, brand: string, foundedDay: number, startingCapital: number): Dealership {
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
      tier: "silver",
      quotaUnitsMonthly: 18,
      quotaAttainedThisMonth: 0,
      allocationCapMonthly: 18,
      allocationOrderedThisMonth: 0,
      csi: 78,
      facilityStandards: 72,
      complianceStrikes: 0,
      tierHistory: [{ day: foundedDay, tier: "silver" }],
      terminated: false,
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
      cash: startingCapital,
      vehicleInventoryValue: 0,
      partsInventoryValue: 22000,
      floorPlanPayable: 0,
      accountsPayable: 0,
      ownerEquityContributed: STARTING_OWNER_EQUITY,
      retainedEarnings: startingCapital + 22000 - STARTING_OWNER_EQUITY,
    },
    monthlyHistory: [],
    currentMonth: emptyMonth("Month 1"),
    reputation: 58,
    serviceCustomerBase: 120,
    isUsedOnly: false,
    failure: null,
  };
}

function newCareer(): CareerState {
  return {
    role: "gm",
    equityPct: 0,
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

export function createNewGame(seed: number = Date.now()): GameState {
  const rng = new Rng(seed);
  const dealershipId = nextId("dlr");
  const dealership = createDealership(rng, dealershipId, "Meridian Point Motors", "Meridian Motors", 0, STARTING_CASH);

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
  };
}

export const OVERHEAD_MONTHLY_DEFAULT = OVERHEAD_MONTHLY;
