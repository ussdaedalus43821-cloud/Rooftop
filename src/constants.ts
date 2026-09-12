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

export const VEHICLE_MODELS_NEW: { name: string; trim: string; class: "sedan" | "suv" | "truck" | "coupe" | "minivan" | "ev"; msrp: number; invoiceFrac: number; desirability: number }[] = [
  { name: "Meridian", trim: "LX", class: "sedan", msrp: 26500, invoiceFrac: 0.93, desirability: 0.45 },
  { name: "Meridian", trim: "Sport", class: "sedan", msrp: 31500, invoiceFrac: 0.92, desirability: 0.55 },
  { name: "Highpoint", trim: "SE", class: "suv", msrp: 34900, invoiceFrac: 0.93, desirability: 0.65 },
  { name: "Highpoint", trim: "Limited", class: "suv", msrp: 42900, invoiceFrac: 0.91, desirability: 0.78 },
  { name: "Ridgeback", trim: "Work", class: "truck", msrp: 38900, invoiceFrac: 0.94, desirability: 0.6 },
  { name: "Ridgeback", trim: "Crew 4x4", class: "truck", msrp: 52900, invoiceFrac: 0.91, desirability: 0.82 },
  { name: "Voyage", trim: "LE", class: "minivan", msrp: 36900, invoiceFrac: 0.93, desirability: 0.4 },
  { name: "Solace", trim: "Coupe", class: "coupe", msrp: 29900, invoiceFrac: 0.92, desirability: 0.5 },
  { name: "Volt-E", trim: "Standard Range", class: "ev", msrp: 41900, invoiceFrac: 0.94, desirability: 0.7 },
  { name: "Volt-E", trim: "Long Range", class: "ev", msrp: 49900, invoiceFrac: 0.92, desirability: 0.85 },
];

export const CUSTOMER_FIRST_NAMES = ["James", "Maria", "David", "Linda", "Robert", "Susan", "Michael", "Karen", "Chris", "Patricia", "Daniel", "Nancy", "Kevin", "Betty", "Brian", "Sandra", "Mark", "Ashley", "Steven", "Emily"];
export const CUSTOMER_LAST_NAMES = ["Nguyen", "Smith", "Garcia", "Johnson", "Brown", "Miller", "Davis", "Wilson", "Anderson", "Thomas", "Moore", "Martin", "Lee", "Walker", "Hall", "Young", "King", "Wright", "Scott", "Torres"];

export const STAFF_FIRST_NAMES = ["Alex", "Jordan", "Taylor", "Casey", "Morgan", "Riley", "Jamie", "Cameron", "Drew", "Sam"];
export const STAFF_LAST_NAMES = ["Reyes", "Coleman", "Patel", "Nguyen", "Okafor", "Fischer", "Rossi", "Novak", "Bianchi", "Suarez"];

export const OVERHEAD_MONTHLY = 38_000; // rent, utilities, insurance, admin
