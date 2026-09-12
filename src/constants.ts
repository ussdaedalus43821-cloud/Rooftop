import type { FranchiseKey, VehicleClass } from "./types.js";

export const DAY_MS_AT_1X = 6000; // real ms per game-day at 1x speed

export const FLOORPLAN_DAILY_RATE = 0.08 / 365; // ~8%/yr simple daily
export const CURTAILMENT_THRESHOLD_DAYS = 90;
export const CURTAILMENT_INTERVAL_DAYS = 30;
export const CURTAILMENT_FRACTION = 0.1;
export const CURTAILMENT_GRACE_DAYS = 14;
export const AUDIT_FAIL_SEVERITY = 100;

export const STRONG_MONTH_SCORE_THRESHOLD = 70;
export const MONTHS_FOR_OWNERSHIP_OFFER = 6;

export const CSI_TERMINATION_THRESHOLD = 55;
export const QUOTA_TERMINATION_MONTHS = 4;

export interface FranchiseModelSeed {
  name: string;
  trim: string;
  class: VehicleClass;
  msrp: number;
  invoiceFrac: number;
  desirability: number;
}

export interface FranchiseOption {
  key: FranchiseKey;
  brand: string;
  tagline: string;
  description: string;
  startingCash: number;
  startingOwnerEquity: number;
  baseQuota: number;
}

export const FRANCHISE_OPTIONS: FranchiseOption[] = [
  {
    key: "ford",
    brand: "Ford",
    tagline: "Trucks, SUVs, and America's best-selling pickup",
    description: "High-volume mainstream store built on F-150 and Explorer traffic. No sedan in the lineup — real Ford dealers don't carry one anymore either.",
    startingCash: 250_000,
    startingOwnerEquity: 400_000,
    baseQuota: 18,
  },
  {
    key: "chevrolet",
    brand: "Chevrolet",
    tagline: "The broadest mainstream lineup, sedan to full-size SUV",
    description: "Widest spread of any franchise here — Malibu through Tahoe and Silverado — which means broader traffic but thinner desirability on any one unit.",
    startingCash: 250_000,
    startingOwnerEquity: 400_000,
    baseQuota: 18,
  },
  {
    key: "bmw",
    brand: "BMW",
    tagline: "Luxury performance — higher stickers, higher stakes",
    description: "Far higher ASPs and F&I dollars per deal, but fewer, pickier ups and a CSI bar the manufacturer actually enforces. No trucks, no minivans.",
    startingCash: 380_000,
    startingOwnerEquity: 600_000,
    baseQuota: 10,
  },
];

export function getFranchiseOption(key: FranchiseKey): FranchiseOption {
  const option = FRANCHISE_OPTIONS.find((f) => f.key === key);
  if (!option) throw new Error(`Unknown franchise key: ${key}`);
  return option;
}

// Real current-model-year trims and approximate US MSRPs, one catalog per
// selectable franchise. Invoice fractions sit in the tight bands real
// invoices actually run — which is the whole point: front-end gross is
// thin by design, especially on the mainstream brands.
export const FRANCHISE_CATALOGS: Record<FranchiseKey, FranchiseModelSeed[]> = {
  ford: [
    { name: "Escape", trim: "SE", class: "suv", msrp: 28365, invoiceFrac: 0.95, desirability: 0.5 },
    { name: "Explorer", trim: "XLT", class: "suv", msrp: 38365, invoiceFrac: 0.93, desirability: 0.62 },
    { name: "Bronco", trim: "Big Bend", class: "suv", msrp: 39130, invoiceFrac: 0.92, desirability: 0.7 },
    { name: "F-150", trim: "XLT", class: "truck", msrp: 40680, invoiceFrac: 0.94, desirability: 0.72 },
    { name: "F-150", trim: "Lariat", class: "truck", msrp: 52235, invoiceFrac: 0.91, desirability: 0.85 },
    { name: "Ranger", trim: "XLT", class: "truck", msrp: 33885, invoiceFrac: 0.94, desirability: 0.55 },
    { name: "Mustang", trim: "GT", class: "coupe", msrp: 45480, invoiceFrac: 0.92, desirability: 0.75 },
    { name: "Mustang Mach-E", trim: "Premium", class: "ev", msrp: 47225, invoiceFrac: 0.93, desirability: 0.65 },
  ],
  chevrolet: [
    { name: "Malibu", trim: "LT", class: "sedan", msrp: 24895, invoiceFrac: 0.95, desirability: 0.32 },
    { name: "Equinox", trim: "LT", class: "suv", msrp: 27995, invoiceFrac: 0.95, desirability: 0.55 },
    { name: "Traverse", trim: "LT", class: "suv", msrp: 36495, invoiceFrac: 0.93, desirability: 0.6 },
    { name: "Tahoe", trim: "LT", class: "suv", msrp: 58395, invoiceFrac: 0.91, desirability: 0.8 },
    { name: "Silverado 1500", trim: "LT", class: "truck", msrp: 38395, invoiceFrac: 0.94, desirability: 0.68 },
    { name: "Silverado 1500", trim: "High Country", class: "truck", msrp: 60395, invoiceFrac: 0.9, desirability: 0.85 },
    { name: "Colorado", trim: "LT", class: "truck", msrp: 32495, invoiceFrac: 0.94, desirability: 0.5 },
    { name: "Blazer EV", trim: "LT", class: "ev", msrp: 44995, invoiceFrac: 0.93, desirability: 0.6 },
  ],
  bmw: [
    { name: "3 Series", trim: "330i", class: "sedan", msrp: 45700, invoiceFrac: 0.93, desirability: 0.55 },
    { name: "5 Series", trim: "530i", class: "sedan", msrp: 58900, invoiceFrac: 0.91, desirability: 0.68 },
    { name: "X3", trim: "xDrive30i", class: "suv", msrp: 47100, invoiceFrac: 0.92, desirability: 0.62 },
    { name: "X5", trim: "xDrive40i", class: "suv", msrp: 66300, invoiceFrac: 0.9, desirability: 0.78 },
    { name: "4 Series", trim: "430i Coupe", class: "coupe", msrp: 48800, invoiceFrac: 0.92, desirability: 0.6 },
    { name: "M4", trim: "Competition", class: "coupe", msrp: 81100, invoiceFrac: 0.89, desirability: 0.9 },
    { name: "i4", trim: "eDrive40", class: "ev", msrp: 52200, invoiceFrac: 0.92, desirability: 0.65 },
    { name: "iX", trim: "xDrive50", class: "ev", msrp: 87100, invoiceFrac: 0.89, desirability: 0.85 },
  ],
};

// The wholesale/auction market mixes every make and model, regardless of
// which franchise a store holds — this is what a dealer draws used
// inventory from beyond their own trade-ins.
export const ALL_FRANCHISE_MODELS: FranchiseModelSeed[] = Object.values(FRANCHISE_CATALOGS).flat();

// Trade-ins — customers can roll up in anything, not just the franchise
// brand — so these become real (if generically valued) used inventory
// once appraised, not a copy of whatever new car they're buying.
export const TRADE_IN_MODELS: { name: string; class: VehicleClass }[] = [
  { name: "Honda Accord", class: "sedan" },
  { name: "Honda CR-V", class: "suv" },
  { name: "Ford F-150", class: "truck" },
  { name: "Ford Escape", class: "suv" },
  { name: "Chevrolet Malibu", class: "sedan" },
  { name: "Chevrolet Equinox", class: "suv" },
  { name: "Nissan Altima", class: "sedan" },
  { name: "Nissan Rogue", class: "suv" },
  { name: "Jeep Grand Cherokee", class: "suv" },
  { name: "Subaru Outback", class: "suv" },
  { name: "Hyundai Elantra", class: "sedan" },
  { name: "Hyundai Santa Fe", class: "suv" },
  { name: "Mazda CX-5", class: "suv" },
  { name: "Kia Sorento", class: "suv" },
  { name: "Volkswagen Jetta", class: "sedan" },
  { name: "GMC Sierra", class: "truck" },
  { name: "Dodge Grand Caravan", class: "minivan" },
  { name: "BMW 3 Series", class: "sedan" },
  { name: "Mini Cooper", class: "coupe" },
  { name: "Tesla Model 3", class: "ev" },
];

export const CUSTOMER_FIRST_NAMES = ["James", "Maria", "David", "Linda", "Robert", "Susan", "Michael", "Karen", "Chris", "Patricia", "Daniel", "Nancy", "Kevin", "Betty", "Brian", "Sandra", "Mark", "Ashley", "Steven", "Emily"];
export const CUSTOMER_LAST_NAMES = ["Nguyen", "Smith", "Garcia", "Johnson", "Brown", "Miller", "Davis", "Wilson", "Anderson", "Thomas", "Moore", "Martin", "Lee", "Walker", "Hall", "Young", "King", "Wright", "Scott", "Torres"];

export const STAFF_FIRST_NAMES = ["Alex", "Jordan", "Taylor", "Casey", "Morgan", "Riley", "Jamie", "Cameron", "Drew", "Sam"];
export const STAFF_LAST_NAMES = ["Reyes", "Coleman", "Patel", "Nguyen", "Okafor", "Fischer", "Rossi", "Novak", "Bianchi", "Suarez"];

export const OVERHEAD_MONTHLY = 38_000; // rent, utilities, insurance, admin
