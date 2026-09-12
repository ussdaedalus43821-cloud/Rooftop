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

export const STARTING_CASH = 250_000;
export const STARTING_OWNER_EQUITY = 400_000;

export const FRANCHISE_BRAND = "Toyota";

// Real 2024-model-year Toyota trims and approximate US MSRPs. Invoice
// fractions sit in the tight 91-95% band real Toyota invoices actually run —
// which is the whole point: front-end gross on these is thin by design.
export const VEHICLE_MODELS_NEW: { name: string; trim: string; class: "sedan" | "suv" | "truck" | "coupe" | "minivan" | "ev"; msrp: number; invoiceFrac: number; desirability: number }[] = [
  { name: "Corolla", trim: "LE", class: "sedan", msrp: 23100, invoiceFrac: 0.95, desirability: 0.35 },
  { name: "Camry", trim: "XSE", class: "sedan", msrp: 33400, invoiceFrac: 0.93, desirability: 0.58 },
  { name: "RAV4", trim: "LE", class: "suv", msrp: 29500, invoiceFrac: 0.94, desirability: 0.62 },
  { name: "RAV4", trim: "Limited", class: "suv", msrp: 39000, invoiceFrac: 0.92, desirability: 0.75 },
  { name: "Tacoma", trim: "SR5", class: "truck", msrp: 33900, invoiceFrac: 0.94, desirability: 0.6 },
  { name: "Tundra", trim: "Limited CrewMax", class: "truck", msrp: 52000, invoiceFrac: 0.91, desirability: 0.82 },
  { name: "Sienna", trim: "XLE", class: "minivan", msrp: 40200, invoiceFrac: 0.93, desirability: 0.45 },
  { name: "GR86", trim: "Premium", class: "coupe", msrp: 30300, invoiceFrac: 0.92, desirability: 0.58 },
  { name: "bZ4X", trim: "XLE", class: "ev", msrp: 43220, invoiceFrac: 0.94, desirability: 0.68 },
  { name: "bZ4X", trim: "Limited", class: "ev", msrp: 48250, invoiceFrac: 0.92, desirability: 0.8 },
];

// Trade-ins — customers can roll up in anything, not just the franchise
// brand — so these become real (if generically valued) used inventory
// once appraised, not a copy of whatever new car they're buying.
export const TRADE_IN_MODELS: { name: string; class: "sedan" | "suv" | "truck" | "coupe" | "minivan" | "ev" }[] = [
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
