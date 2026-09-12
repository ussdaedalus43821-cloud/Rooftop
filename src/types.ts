// ---------------------------------------------------------------------------
// Rooftop — core domain types
// ---------------------------------------------------------------------------

export type ClockSpeed = 0 | 1 | 4 | 15;

export interface SimDate {
  /** Total days elapsed since game start (day 0 = start date). */
  day: number;
}

export type VehicleClass = "sedan" | "suv" | "truck" | "coupe" | "minivan" | "ev";
export type FranchiseKey = "ford" | "chevrolet" | "bmw";

export type VehicleCondition = "new" | "used";

export type ReconStage =
  | "acquired"
  | "inspected"
  | "reconditioning"
  | "ready"
  | "listed"
  | "sold";

export interface VehicleModel {
  name: string;
  trim: string;
  class: VehicleClass;
  msrp: number;
  invoice: number;
  desirability: number; // 0-1, drives allocation demand & sell-through speed
}

export interface Vehicle {
  id: string;
  model: VehicleModel;
  condition: VehicleCondition;
  vin: string;
  stage: ReconStage;
  acquiredDay: number;
  daysInStage: number;
  daysInInventory: number; // since acquired, used for floor-plan aging
  acquisitionCost: number; // what the store paid (invoice for new, appraisal/auction for used)
  reconCost: number; // accumulated recon spend
  reconCostEstimate: number;
  reconDaysRequired: number;
  odometer: number;
  listPrice: number;
  floorPlanBalance: number; // principal owed to lender for this unit
  floorPlanOriginal: number;
  curtailmentPaidTiers: number; // how many curtailment tranches already paid
  curtailmentDueSinceDay: number; // day the current unpaid tranche became due (0 = none pending)
  soldOutOfTrustDays: number; // days this unit has been sold-but-unpaid (SOT exposure)
  source: "allocation" | "auction" | "tradein";
}

export type SalesRole = "salesperson" | "fi_manager" | "service_tech" | "service_advisor";

export interface StaffMember {
  id: string;
  name: string;
  role: SalesRole;
  skill: number; // 0-100
  experienceDays: number;
  morale: number; // 0-100
  monthlySalary: number;
  commissionRate?: number; // for salespeople, share of front-end gross
  dealsThisMonth: number;
  grossThisMonth: number;
}

export interface Customer {
  id: string;
  name: string;
  budgetMonthly: number; // desired monthly payment ceiling
  downPaymentCash: number;
  creditTier: "prime" | "nearprime" | "subprime";
  hasTrade: boolean;
  tradeVehicle?: {
    description: string;
    modelName: string;
    class: VehicleClass;
    year: number;
    marketValue: number; // "true" wholesale value, hidden-ish ground truth
    condition: number; // 0-1
  };
  interestedModelClass: VehicleClass;
  patience: number; // rounds of negotiation before walking, 1-4
  priceFlexibility: number; // 0-1, how much above their target they'll tolerate
}

export type DealStage = "shopping" | "negotiating" | "agreed" | "fi" | "closed" | "lost";

export interface FourSquareTerms {
  price: number;
  tradeAllowance: number;
  downPayment: number;
  termMonths: number;
  aprBuyRate: number; // rate the bank actually approved
  aprSellRate: number; // rate quoted to customer (marked up); reserve = difference
  monthlyPayment: number;
}

export interface FiProductOffer {
  key: "warranty" | "gap" | "aftermarket" | "paint" | "maintenance";
  label: string;
  cost: number; // dealer cost
  price: number; // price presented to customer
  attached: boolean;
  pitched: boolean;
}

export interface Deal {
  id: string;
  customer: Customer;
  vehicleId: string;
  stage: DealStage;
  round: number;
  terms: FourSquareTerms;
  tradeVehicleAppraised?: number;
  frontEndGross: number;
  fiGross: number;
  fiProducts: FiProductOffer[];
  financeReserve: number;
  salespersonId?: string;
  fiManagerId?: string;
  createdDay: number;
  lastCustomerMood: number; // -1..1, satisfaction with current offer
  log: string[];
}

export type AllocationTier = "bronze" | "silver" | "gold" | "platinum";

export interface ManufacturerRelations {
  brand: string;
  franchiseKey: FranchiseKey;
  tier: AllocationTier;
  quotaUnitsMonthly: number;
  quotaAttainedThisMonth: number;
  allocationCapMonthly: number;
  allocationOrderedThisMonth: number;
  csi: number; // 0-100
  facilityStandards: number; // 0-100
  complianceStrikes: number;
  tierHistory: { day: number; tier: AllocationTier }[];
  terminated: boolean;
  monthsBelowThreshold: number;
}

export interface FloorPlanState {
  dailyRate: number; // daily interest rate applied to unit balances
  curtailmentThresholdDays: number; // first curtailment trigger
  curtailmentIntervalDays: number; // subsequent triggers every N days after
  curtailmentFraction: number; // fraction of original balance due per tranche
  curtailmentGraceDays: number;
  accruedInterestPayable: number; // accrues daily, paid monthly
  outstandingCurtailmentDue: number;
  violationSeverity: number; // rolling audit-risk score
  holdPayoffs: boolean; // emergency lever: defer payoff of sold units
  auditFailed: boolean; // terminal: line pulled
  monthsSinceAudit: number;
}

export interface ServiceBayJob {
  id: string;
  kind: "warranty" | "customerPay" | "recon";
  vehicleId?: string;
  hoursRequired: number;
  hoursCompleted: number;
  laborRate: number; // rate this job bills at
  partsCost: number;
  partsAvailable: boolean;
  customerName?: string;
}

export interface PartsInventory {
  stockedValue: number;
  stockedUnits: number;
  targetStockUnits: number;
  fillRate: number; // 0-1 chance a needed part is on-hand
  specialOrderDelayDays: number;
}

export interface ServiceDept {
  bays: number;
  techs: StaffMember[];
  advisors: StaffMember[];
  warrantyRate: number; // manufacturer reimbursement $/hr
  customerPayRate: number; // shop's retail labor rate $/hr
  retentionRate: number; // 0-1, chance a past customer returns for service
  jobs: ServiceBayJob[];
  parts: PartsInventory;
  csiContribution: number;
  monthlyCustomerPayGross: number;
  monthlyWarrantyGross: number;
  monthlyPartsGross: number;
}

export interface LedgerAccounts {
  cash: number;
  vehicleInventoryValue: number;
  partsInventoryValue: number;
  floorPlanPayable: number;
  accountsPayable: number;
  ownerEquityContributed: number;
  retainedEarnings: number;
}

export interface MonthlyFinancials {
  monthLabel: string;
  frontEndGross: number;
  fiGross: number;
  serviceGross: number;
  partsGross: number;
  totalGrossProfit: number;
  payrollExpense: number;
  floorPlanInterestExpense: number;
  overheadExpense: number;
  curtailmentPenalties: number;
  netIncome: number;
  unitsSoldNew: number;
  unitsSoldUsed: number;
  csiAvgScore: number;
}

export interface CareerState {
  role: "gm" | "partial_owner" | "owner_operator";
  equityPct: number;
  bonusPoolAccrued: number;
  consecutiveStrongMonths: number;
  monthsEmployed: number;
  milestoneOfferPending: boolean;
  milestoneOfferDay?: number;
  milestoneResolved: boolean;
  performanceHistory: number[];
}

export type FailureKind = "floorplan_seized" | null;

export interface GameSettings {
  autoSaveEnabled: boolean;
}

export interface Dealership {
  id: string;
  name: string;
  brand: string;
  foundedDay: number;
  vehicles: Vehicle[];
  staff: StaffMember[];
  deals: Deal[];
  activeCustomers: Customer[];
  manufacturer: ManufacturerRelations;
  floorPlan: FloorPlanState;
  service: ServiceDept;
  ledger: LedgerAccounts;
  monthlyHistory: MonthlyFinancials[];
  currentMonth: MonthlyFinancials;
  reputation: number; // 0-100, drives showroom traffic
  serviceCustomerBase: number; // count of past buyers eligible for retention
  isUsedOnly: boolean; // true after franchise termination
  failure: FailureKind;
}

export interface GameState {
  version: number;
  seed: number;
  rngState: number;
  day: number;
  speed: ClockSpeed;
  realMsAccumulator: number;
  dealerships: Record<string, Dealership>;
  activeDealershipId: string;
  career: CareerState;
  settings: GameSettings;
  activeTab: string;
  toasts: { id: string; text: string; kind: "good" | "bad" | "warn" | "info"; day: number }[];
  gameOver: { kind: FailureKind; message: string } | null;
  lastSavedDay: number;
}
