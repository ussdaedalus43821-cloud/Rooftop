import type { FranchiseCategory, FranchiseKey, VehicleClass } from "./types.js";

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

export interface FranchiseCategoryOption {
  key: FranchiseCategory;
  label: string;
  description: string;
}

export const FRANCHISE_CATEGORIES: FranchiseCategoryOption[] = [
  {
    key: "mainstream",
    label: "Mainstream",
    description: "Broad-appeal, high-volume brands — the traditional full-line lot.",
  },
  {
    key: "value",
    label: "Value / Budget",
    description: "Lower price points aimed at value-conscious, budget-limited buyers.",
  },
  {
    key: "luxury",
    label: "Luxury",
    description: "Premium brands — higher stickers, higher F&I dollars, pickier customers.",
  },
  {
    key: "online",
    label: "Online-Only / Direct-to-Consumer",
    description: "EV-native or online-first sellers — no traditional franchise haggling.",
  },
];

export interface FranchiseOption {
  key: FranchiseKey;
  category: FranchiseCategory;
  brand: string;
  tagline: string;
  description: string;
  startingCash: number;
  startingOwnerEquity: number;
  baseQuota: number;
}

export const FRANCHISE_OPTIONS: FranchiseOption[] = [
  // ---- Mainstream ----
  {
    key: "toyota",
    category: "mainstream",
    brand: "Toyota",
    tagline: "The reliability standard — Corolla to Tundra",
    description: "America's best-selling brand. Deep, broad lineup with the tightest invoice margins of any mainstream brand — thin front-end gross by design.",
    startingCash: 250_000,
    startingOwnerEquity: 400_000,
    baseQuota: 20,
  },
  {
    key: "ford",
    category: "mainstream",
    brand: "Ford",
    tagline: "Trucks, SUVs, and America's best-selling pickup",
    description: "High-volume mainstream store built on F-150 and Explorer traffic. No sedan in the lineup — real Ford dealers don't carry one anymore either.",
    startingCash: 250_000,
    startingOwnerEquity: 400_000,
    baseQuota: 18,
  },
  {
    key: "honda",
    category: "mainstream",
    brand: "Honda",
    tagline: "Civic and CR-V traffic, strong resale value",
    description: "Consistently high resale value keeps trade-in math favorable, but that same reputation means thin haggling room on the front end.",
    startingCash: 250_000,
    startingOwnerEquity: 400_000,
    baseQuota: 18,
  },
  {
    key: "volkswagen",
    category: "mainstream",
    brand: "Volkswagen",
    tagline: "German engineering at a mainstream price",
    description: "A smaller, quirkier lineup than the Japanese/domestic majors — Jetta, Tiguan, Atlas, ID.4 — with a bit more room in the invoice.",
    startingCash: 250_000,
    startingOwnerEquity: 400_000,
    baseQuota: 14,
  },
  {
    key: "mazda",
    category: "mainstream",
    brand: "Mazda",
    tagline: "Upscale feel, mainstream price",
    description: "Smaller volume than the majors, but the CX-90 and Mazda3 punch above their price point on desirability.",
    startingCash: 240_000,
    startingOwnerEquity: 380_000,
    baseQuota: 12,
  },
  {
    key: "subaru",
    category: "mainstream",
    brand: "Subaru",
    tagline: "All-wheel-drive loyalists, thin incentives",
    description: "A famously loyal, low-drama customer base — but Subaru is stingy with incentives, so front-end gross stays tight.",
    startingCash: 240_000,
    startingOwnerEquity: 380_000,
    baseQuota: 14,
  },
  {
    key: "hyundai",
    category: "mainstream",
    brand: "Hyundai",
    tagline: "Value-forward mainstream, strong EV push",
    description: "Aggressive warranties and value pricing across a lineup that now includes a serious EV wing in the Ioniq 5.",
    startingCash: 245_000,
    startingOwnerEquity: 390_000,
    baseQuota: 16,
  },
  {
    key: "jeep",
    category: "mainstream",
    brand: "Jeep",
    tagline: "SUVs and off-roaders only",
    description: "Wrangler and Grand Cherokee loyalty runs deep, but the lineup is SUV-only top to bottom — no sedans, no minivans.",
    startingCash: 250_000,
    startingOwnerEquity: 400_000,
    baseQuota: 14,
  },
  {
    key: "chevrolet",
    category: "mainstream",
    brand: "Chevrolet",
    tagline: "The broadest mainstream lineup, sedan to full-size SUV",
    description: "Widest spread of any mainstream franchise — Malibu through Tahoe and Silverado — which means broader traffic but thinner desirability on any one unit.",
    startingCash: 250_000,
    startingOwnerEquity: 400_000,
    baseQuota: 18,
  },

  // ---- Value / Budget ----
  {
    key: "mitsubishi",
    category: "value",
    brand: "Mitsubishi",
    tagline: "The cheapest new cars in America",
    description: "Rock-bottom MSRPs (the Mirage is the least expensive new car sold in the US) mean thin dollars per unit — volume is everything.",
    startingCash: 180_000,
    startingOwnerEquity: 280_000,
    baseQuota: 14,
  },
  {
    key: "nissan",
    category: "value",
    brand: "Nissan",
    tagline: "Value pricing with real fleet volume",
    description: "Sentra-to-Titan spread with aggressive incentives — competitive but a real fight to protect front-end gross.",
    startingCash: 220_000,
    startingOwnerEquity: 340_000,
    baseQuota: 18,
  },
  {
    key: "kia",
    category: "value",
    brand: "Kia",
    tagline: "Value pricing, surprisingly strong desirability",
    description: "Telluride and EV6 punch well above Kia's old budget reputation — one of the better margin stories in this tier.",
    startingCash: 210_000,
    startingOwnerEquity: 330_000,
    baseQuota: 16,
  },
  {
    key: "buick",
    category: "value",
    brand: "Buick",
    tagline: "SUV-only, quietly profitable",
    description: "No sedans left in the US lineup — just Encore GX, Envision, and Enclave — a small, low-drama SUV-only store.",
    startingCash: 190_000,
    startingOwnerEquity: 300_000,
    baseQuota: 10,
  },
  {
    key: "dacia",
    category: "value",
    brand: "Dacia",
    tagline: "Europe's rock-bottom price leader",
    description: "Renault's no-frills budget brand — Sandero, Duster, Jogger — sold at prices no mainstream brand can touch. Dollars per unit are small.",
    startingCash: 150_000,
    startingOwnerEquity: 240_000,
    baseQuota: 12,
  },
  {
    key: "byd",
    category: "value",
    brand: "BYD",
    tagline: "Affordable Chinese EVs, fast-growing globally",
    description: "The world's largest EV maker by volume — Seagull, Dolphin, Atto 3, Seal — undercutting Western EV pricing at every level.",
    startingCash: 180_000,
    startingOwnerEquity: 280_000,
    baseQuota: 14,
  },
  {
    key: "mg",
    category: "value",
    brand: "MG",
    tagline: "British badge, budget Chinese-built lineup",
    description: "A historic British name now owned by SAIC, selling cut-rate hatchbacks and small SUVs across the value segment.",
    startingCash: 160_000,
    startingOwnerEquity: 260_000,
    baseQuota: 12,
  },

  // ---- Luxury ----
  {
    key: "bmw",
    category: "luxury",
    brand: "BMW",
    tagline: "Luxury performance — higher stickers, higher stakes",
    description: "Far higher ASPs and F&I dollars per deal, but fewer, pickier ups and a CSI bar the manufacturer actually enforces. No trucks, no minivans.",
    startingCash: 380_000,
    startingOwnerEquity: 600_000,
    baseQuota: 10,
  },
  {
    key: "lexus",
    category: "luxury",
    brand: "Lexus",
    tagline: "Toyota's luxury arm — reliability meets premium",
    description: "The same reliability halo as Toyota, at luxury prices — consistently tops customer-satisfaction rankings, which the CSI system rewards.",
    startingCash: 400_000,
    startingOwnerEquity: 620_000,
    baseQuota: 12,
  },
  {
    key: "infiniti",
    category: "luxury",
    brand: "Infiniti",
    tagline: "Nissan's luxury arm, smaller footprint",
    description: "A smaller, less prestigious luxury lineup than the Germans or Lexus — real dealer challenge is desirability, not just price.",
    startingCash: 340_000,
    startingOwnerEquity: 520_000,
    baseQuota: 8,
  },
  {
    key: "cadillac",
    category: "luxury",
    brand: "Cadillac",
    tagline: "American luxury, all-in on EVs",
    description: "Escalade halo traffic plus a serious EV push in the Lyriq — a domestic luxury store with real range in price points.",
    startingCash: 360_000,
    startingOwnerEquity: 560_000,
    baseQuota: 10,
  },
  {
    key: "acura",
    category: "luxury",
    brand: "Acura",
    tagline: "Honda's luxury arm — value-oriented premium",
    description: "The most accessible luxury tier here — Integra through MDX — a gentler entry into luxury-store economics.",
    startingCash: 320_000,
    startingOwnerEquity: 500_000,
    baseQuota: 10,
  },
  {
    key: "genesis",
    category: "luxury",
    brand: "Genesis",
    tagline: "Hyundai's luxury arm, fast-rising reputation",
    description: "The newest luxury nameplate here, still building brand desirability — real upside as CSI and reputation compound.",
    startingCash: 350_000,
    startingOwnerEquity: 540_000,
    baseQuota: 8,
  },
  {
    key: "mercedes",
    category: "luxury",
    brand: "Mercedes-Benz",
    tagline: "The German flagship — from C-Class to G-Wagon",
    description: "The widest price spread of any luxury franchise here, C-Class to S-Class to G-Class — huge F&I dollars on the halo units.",
    startingCash: 420_000,
    startingOwnerEquity: 650_000,
    baseQuota: 10,
  },
  {
    key: "audi",
    category: "luxury",
    brand: "Audi",
    tagline: "German performance luxury, strong EV lineup",
    description: "A3 through Q7 plus a real EV wing — consistently strong desirability across the whole range.",
    startingCash: 390_000,
    startingOwnerEquity: 600_000,
    baseQuota: 10,
  },
  {
    key: "landrover",
    category: "luxury",
    brand: "Land Rover",
    tagline: "SUV-only luxury off-roaders",
    description: "Every single unit is an SUV, from the Evoque to the flagship Range Rover — the narrowest, highest-ASP lineup in the game.",
    startingCash: 400_000,
    startingOwnerEquity: 620_000,
    baseQuota: 8,
  },

  // ---- Online-only / direct-to-consumer ----
  {
    key: "rivian",
    category: "online",
    brand: "Rivian",
    tagline: "Adventure EV trucks and SUVs",
    description: "R1T and R1S at genuine luxury-truck prices, plus the smaller upcoming R2 — an EV-only, direct-to-consumer lineup.",
    startingCash: 300_000,
    startingOwnerEquity: 480_000,
    baseQuota: 10,
  },
  {
    key: "lucid",
    category: "online",
    brand: "Lucid",
    tagline: "The longest-range luxury EV sedans",
    description: "Air and Gravity at the very top of the EV price ladder — extremely low volume, extremely high dollars per unit.",
    startingCash: 340_000,
    startingOwnerEquity: 520_000,
    baseQuota: 6,
  },
  {
    key: "slate",
    category: "online",
    brand: "Slate",
    tagline: "A bare-bones, customizable EV pickup startup",
    description: "A single stripped-down electric truck sold direct-to-consumer and customized after purchase — the smallest, cheapest lineup here.",
    startingCash: 150_000,
    startingOwnerEquity: 240_000,
    baseQuota: 12,
  },
  {
    key: "tesla",
    category: "online",
    brand: "Tesla",
    tagline: "The EV volume leader — Model 3 to Cybertruck",
    description: "By far the highest-volume EV lineup — real showroom traffic, but a customer base that shops on price and range, not haggling.",
    startingCash: 320_000,
    startingOwnerEquity: 500_000,
    baseQuota: 16,
  },
  {
    key: "carvana",
    category: "online",
    brand: "Carvana",
    tagline: "Used-only, fully online — no franchise, no new inventory",
    description: "No manufacturer relationship at all: this store lives entirely on wholesale-auction sourcing, trade-ins, and reconditioning margin.",
    startingCash: 260_000,
    startingOwnerEquity: 400_000,
    baseQuota: 0,
  },
];

export function getFranchiseOption(key: FranchiseKey): FranchiseOption {
  const option = FRANCHISE_OPTIONS.find((f) => f.key === key);
  if (!option) throw new Error(`Unknown franchise key: ${key}`);
  return option;
}

export function franchisesInCategory(category: FranchiseCategory): FranchiseOption[] {
  return FRANCHISE_OPTIONS.filter((f) => f.category === category);
}

// Real current/recent-model-year trims and approximate MSRPs, one catalog
// per selectable franchise. Invoice fractions sit in the tight bands real
// invoices actually run — which is the whole point: front-end gross is
// thin by design, especially on the mainstream brands. Franchises only
// carry the classes they actually sell — Jeep has no sedan, Land Rover
// sells nothing but SUVs, Carvana carries no new inventory at all.
export const FRANCHISE_CATALOGS: Record<FranchiseKey, FranchiseModelSeed[]> = {
  toyota: [
    { name: "Corolla", trim: "LE", class: "sedan", msrp: 23100, invoiceFrac: 0.95, desirability: 0.35 },
    { name: "Camry", trim: "XSE", class: "sedan", msrp: 33400, invoiceFrac: 0.93, desirability: 0.58 },
    { name: "RAV4", trim: "LE", class: "suv", msrp: 29500, invoiceFrac: 0.94, desirability: 0.62 },
    { name: "RAV4", trim: "Limited", class: "suv", msrp: 39000, invoiceFrac: 0.92, desirability: 0.75 },
    { name: "Tacoma", trim: "SR5", class: "truck", msrp: 33900, invoiceFrac: 0.94, desirability: 0.6 },
    { name: "Tundra", trim: "Limited CrewMax", class: "truck", msrp: 52000, invoiceFrac: 0.91, desirability: 0.82 },
    { name: "Sienna", trim: "XLE", class: "minivan", msrp: 40200, invoiceFrac: 0.93, desirability: 0.45 },
    { name: "GR86", trim: "Premium", class: "coupe", msrp: 30300, invoiceFrac: 0.92, desirability: 0.58 },
    { name: "bZ4X", trim: "XLE", class: "ev", msrp: 43220, invoiceFrac: 0.94, desirability: 0.68 },
  ],
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
  honda: [
    { name: "Civic", trim: "LX", class: "sedan", msrp: 24150, invoiceFrac: 0.95, desirability: 0.42 },
    { name: "Accord", trim: "Sport", class: "sedan", msrp: 30800, invoiceFrac: 0.93, desirability: 0.58 },
    { name: "CR-V", trim: "EX", class: "suv", msrp: 32000, invoiceFrac: 0.94, desirability: 0.65 },
    { name: "Pilot", trim: "EX-L", class: "suv", msrp: 42000, invoiceFrac: 0.92, desirability: 0.62 },
    { name: "Ridgeline", trim: "RTL", class: "truck", msrp: 42000, invoiceFrac: 0.92, desirability: 0.5 },
    { name: "Odyssey", trim: "EX-L", class: "minivan", msrp: 41000, invoiceFrac: 0.93, desirability: 0.48 },
    { name: "Civic Type R", trim: "Touring", class: "coupe", msrp: 45900, invoiceFrac: 0.9, desirability: 0.72 },
    { name: "Prologue", trim: "EX", class: "ev", msrp: 48000, invoiceFrac: 0.93, desirability: 0.52 },
  ],
  volkswagen: [
    { name: "Jetta", trim: "S", class: "sedan", msrp: 22000, invoiceFrac: 0.95, desirability: 0.35 },
    { name: "Jetta GLI", trim: "Autobahn", class: "sedan", msrp: 31000, invoiceFrac: 0.92, desirability: 0.55 },
    { name: "Tiguan", trim: "SE", class: "suv", msrp: 28500, invoiceFrac: 0.94, desirability: 0.52 },
    { name: "Atlas", trim: "SE", class: "suv", msrp: 37500, invoiceFrac: 0.92, desirability: 0.6 },
    { name: "ID.4", trim: "Pro", class: "ev", msrp: 40500, invoiceFrac: 0.93, desirability: 0.55 },
    { name: "Golf GTI", trim: "SE", class: "coupe", msrp: 31500, invoiceFrac: 0.91, desirability: 0.6 },
  ],
  mazda: [
    { name: "Mazda3", trim: "Preferred", class: "sedan", msrp: 24500, invoiceFrac: 0.95, desirability: 0.4 },
    { name: "CX-5", trim: "Preferred", class: "suv", msrp: 30300, invoiceFrac: 0.94, desirability: 0.6 },
    { name: "CX-90", trim: "Preferred Plus", class: "suv", msrp: 43000, invoiceFrac: 0.92, desirability: 0.65 },
    { name: "MX-5 Miata", trim: "Club", class: "coupe", msrp: 33000, invoiceFrac: 0.91, desirability: 0.62 },
  ],
  subaru: [
    { name: "Impreza", trim: "Base", class: "sedan", msrp: 24000, invoiceFrac: 0.95, desirability: 0.35 },
    { name: "Outback", trim: "Premium", class: "suv", msrp: 31000, invoiceFrac: 0.94, desirability: 0.58 },
    { name: "Forester", trim: "Premium", class: "suv", msrp: 29500, invoiceFrac: 0.94, desirability: 0.55 },
    { name: "Crosstrek", trim: "Premium", class: "suv", msrp: 27000, invoiceFrac: 0.95, desirability: 0.52 },
    { name: "WRX", trim: "Premium", class: "sedan", msrp: 33500, invoiceFrac: 0.92, desirability: 0.6 },
    { name: "Solterra", trim: "Premium", class: "ev", msrp: 40000, invoiceFrac: 0.93, desirability: 0.48 },
  ],
  hyundai: [
    { name: "Elantra", trim: "SE", class: "sedan", msrp: 22000, invoiceFrac: 0.95, desirability: 0.35 },
    { name: "Sonata", trim: "SEL", class: "sedan", msrp: 28000, invoiceFrac: 0.94, desirability: 0.5 },
    { name: "Tucson", trim: "SEL", class: "suv", msrp: 29500, invoiceFrac: 0.94, desirability: 0.58 },
    { name: "Santa Fe", trim: "SEL", class: "suv", msrp: 34500, invoiceFrac: 0.93, desirability: 0.6 },
    { name: "Palisade", trim: "SEL", class: "suv", msrp: 40500, invoiceFrac: 0.92, desirability: 0.65 },
    { name: "Santa Cruz", trim: "SEL", class: "truck", msrp: 27500, invoiceFrac: 0.94, desirability: 0.5 },
    { name: "Ioniq 5", trim: "SEL", class: "ev", msrp: 44000, invoiceFrac: 0.93, desirability: 0.66 },
  ],
  jeep: [
    { name: "Compass", trim: "Latitude", class: "suv", msrp: 28500, invoiceFrac: 0.94, desirability: 0.45 },
    { name: "Grand Cherokee", trim: "Limited", class: "suv", msrp: 42000, invoiceFrac: 0.92, desirability: 0.65 },
    { name: "Wrangler", trim: "Sport S", class: "suv", msrp: 33500, invoiceFrac: 0.93, desirability: 0.72 },
    { name: "Gladiator", trim: "Sport S", class: "truck", msrp: 38500, invoiceFrac: 0.93, desirability: 0.6 },
    { name: "Wagoneer", trim: "Series II", class: "suv", msrp: 60500, invoiceFrac: 0.9, desirability: 0.65 },
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

  mitsubishi: [
    { name: "Mirage", trim: "ES", class: "sedan", msrp: 17700, invoiceFrac: 0.96, desirability: 0.2 },
    { name: "Outlander Sport", trim: "ES", class: "suv", msrp: 25500, invoiceFrac: 0.95, desirability: 0.35 },
    { name: "Outlander", trim: "SE", class: "suv", msrp: 30500, invoiceFrac: 0.94, desirability: 0.42 },
  ],
  nissan: [
    { name: "Sentra", trim: "S", class: "sedan", msrp: 21500, invoiceFrac: 0.95, desirability: 0.35 },
    { name: "Altima", trim: "SV", class: "sedan", msrp: 27000, invoiceFrac: 0.94, desirability: 0.45 },
    { name: "Rogue", trim: "SV", class: "suv", msrp: 29500, invoiceFrac: 0.94, desirability: 0.55 },
    { name: "Pathfinder", trim: "SV", class: "suv", msrp: 38000, invoiceFrac: 0.92, desirability: 0.55 },
    { name: "Frontier", trim: "SV", class: "truck", msrp: 32500, invoiceFrac: 0.93, desirability: 0.5 },
    { name: "Titan", trim: "SV", class: "truck", msrp: 42500, invoiceFrac: 0.92, desirability: 0.52 },
    { name: "Ariya", trim: "Engage", class: "ev", msrp: 43500, invoiceFrac: 0.93, desirability: 0.5 },
  ],
  kia: [
    { name: "Forte", trim: "LXS", class: "sedan", msrp: 20500, invoiceFrac: 0.95, desirability: 0.35 },
    { name: "K5", trim: "LXS", class: "sedan", msrp: 27500, invoiceFrac: 0.94, desirability: 0.5 },
    { name: "Sportage", trim: "LX", class: "suv", msrp: 28500, invoiceFrac: 0.94, desirability: 0.55 },
    { name: "Telluride", trim: "EX", class: "suv", msrp: 38000, invoiceFrac: 0.92, desirability: 0.68 },
    { name: "Carnival", trim: "LX", class: "minivan", msrp: 34500, invoiceFrac: 0.93, desirability: 0.5 },
    { name: "EV6", trim: "Wind", class: "ev", msrp: 43500, invoiceFrac: 0.93, desirability: 0.6 },
  ],
  buick: [
    { name: "Encore GX", trim: "Preferred", class: "suv", msrp: 26500, invoiceFrac: 0.94, desirability: 0.4 },
    { name: "Envision", trim: "Preferred", class: "suv", msrp: 34500, invoiceFrac: 0.93, desirability: 0.5 },
    { name: "Enclave", trim: "Essence", class: "suv", msrp: 46500, invoiceFrac: 0.91, desirability: 0.55 },
  ],
  dacia: [
    { name: "Sandero", trim: "Essential", class: "sedan", msrp: 14000, invoiceFrac: 0.95, desirability: 0.25 },
    { name: "Duster", trim: "Comfort", class: "suv", msrp: 18500, invoiceFrac: 0.94, desirability: 0.35 },
    { name: "Jogger", trim: "Comfort", class: "minivan", msrp: 19500, invoiceFrac: 0.94, desirability: 0.3 },
  ],
  byd: [
    { name: "Seagull", trim: "Standard", class: "sedan", msrp: 19990, invoiceFrac: 0.94, desirability: 0.3 },
    { name: "Dolphin", trim: "Standard", class: "sedan", msrp: 22500, invoiceFrac: 0.94, desirability: 0.35 },
    { name: "Atto 3", trim: "Standard", class: "suv", msrp: 28500, invoiceFrac: 0.93, desirability: 0.45 },
    { name: "Seal", trim: "Premium", class: "sedan", msrp: 31500, invoiceFrac: 0.92, desirability: 0.55 },
  ],
  mg: [
    { name: "MG3", trim: "SE", class: "sedan", msrp: 19000, invoiceFrac: 0.94, desirability: 0.3 },
    { name: "MG ZS", trim: "SE", class: "suv", msrp: 24000, invoiceFrac: 0.94, desirability: 0.4 },
    { name: "MG HS", trim: "SE", class: "suv", msrp: 28500, invoiceFrac: 0.93, desirability: 0.48 },
    { name: "MG4", trim: "SE", class: "ev", msrp: 30500, invoiceFrac: 0.93, desirability: 0.45 },
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
  lexus: [
    { name: "ES", trim: "350", class: "sedan", msrp: 44000, invoiceFrac: 0.92, desirability: 0.55 },
    { name: "IS", trim: "300", class: "sedan", msrp: 42000, invoiceFrac: 0.92, desirability: 0.55 },
    { name: "RX", trim: "350", class: "suv", msrp: 48500, invoiceFrac: 0.91, desirability: 0.68 },
    { name: "GX", trim: "550", class: "suv", msrp: 64000, invoiceFrac: 0.9, desirability: 0.7 },
    { name: "NX", trim: "350", class: "suv", msrp: 42500, invoiceFrac: 0.92, desirability: 0.58 },
    { name: "LC", trim: "500", class: "coupe", msrp: 93000, invoiceFrac: 0.88, desirability: 0.85 },
    { name: "RZ", trim: "450e", class: "ev", msrp: 47500, invoiceFrac: 0.92, desirability: 0.55 },
  ],
  infiniti: [
    { name: "Q50", trim: "Pure", class: "sedan", msrp: 42000, invoiceFrac: 0.92, desirability: 0.48 },
    { name: "QX50", trim: "Pure", class: "suv", msrp: 40000, invoiceFrac: 0.92, desirability: 0.5 },
    { name: "QX60", trim: "Pure", class: "suv", msrp: 48500, invoiceFrac: 0.91, desirability: 0.55 },
    { name: "QX80", trim: "Luxe", class: "suv", msrp: 75000, invoiceFrac: 0.89, desirability: 0.62 },
  ],
  cadillac: [
    { name: "CT4", trim: "Luxury", class: "sedan", msrp: 37500, invoiceFrac: 0.92, desirability: 0.45 },
    { name: "CT5", trim: "Luxury", class: "sedan", msrp: 40500, invoiceFrac: 0.91, desirability: 0.55 },
    { name: "XT4", trim: "Luxury", class: "suv", msrp: 38500, invoiceFrac: 0.92, desirability: 0.5 },
    { name: "XT5", trim: "Luxury", class: "suv", msrp: 47500, invoiceFrac: 0.91, desirability: 0.58 },
    { name: "Escalade", trim: "Luxury", class: "suv", msrp: 87500, invoiceFrac: 0.89, desirability: 0.82 },
    { name: "Lyriq", trim: "Luxury", class: "ev", msrp: 58500, invoiceFrac: 0.9, desirability: 0.62 },
  ],
  acura: [
    { name: "Integra", trim: "A-Spec", class: "sedan", msrp: 32000, invoiceFrac: 0.93, desirability: 0.5 },
    { name: "TLX", trim: "Technology", class: "sedan", msrp: 40000, invoiceFrac: 0.92, desirability: 0.55 },
    { name: "RDX", trim: "Technology", class: "suv", msrp: 42500, invoiceFrac: 0.92, desirability: 0.6 },
    { name: "MDX", trim: "Technology", class: "suv", msrp: 51500, invoiceFrac: 0.91, desirability: 0.62 },
    { name: "ZDX", trim: "A-Spec", class: "ev", msrp: 51000, invoiceFrac: 0.91, desirability: 0.55 },
  ],
  genesis: [
    { name: "G70", trim: "2.5T", class: "sedan", msrp: 42000, invoiceFrac: 0.92, desirability: 0.55 },
    { name: "G80", trim: "2.5T", class: "sedan", msrp: 50500, invoiceFrac: 0.91, desirability: 0.6 },
    { name: "GV70", trim: "2.5T", class: "suv", msrp: 45500, invoiceFrac: 0.92, desirability: 0.62 },
    { name: "GV80", trim: "2.5T", class: "suv", msrp: 58500, invoiceFrac: 0.9, desirability: 0.68 },
    { name: "Electrified GV70", trim: "Advanced", class: "ev", msrp: 62500, invoiceFrac: 0.9, desirability: 0.6 },
  ],
  mercedes: [
    { name: "C-Class", trim: "C 300", class: "sedan", msrp: 47500, invoiceFrac: 0.91, desirability: 0.6 },
    { name: "E-Class", trim: "E 350", class: "sedan", msrp: 62500, invoiceFrac: 0.9, desirability: 0.68 },
    { name: "GLC", trim: "300", class: "suv", msrp: 50000, invoiceFrac: 0.91, desirability: 0.65 },
    { name: "GLE", trim: "350", class: "suv", msrp: 65500, invoiceFrac: 0.9, desirability: 0.7 },
    { name: "G-Class", trim: "G 550", class: "suv", msrp: 140000, invoiceFrac: 0.87, desirability: 0.92 },
    { name: "EQE", trim: "350+", class: "ev", msrp: 76500, invoiceFrac: 0.89, desirability: 0.6 },
    { name: "S-Class", trim: "S 500", class: "sedan", msrp: 115500, invoiceFrac: 0.87, desirability: 0.85 },
  ],
  audi: [
    { name: "A3", trim: "Premium", class: "sedan", msrp: 37500, invoiceFrac: 0.92, desirability: 0.5 },
    { name: "A4", trim: "Premium", class: "sedan", msrp: 44500, invoiceFrac: 0.91, desirability: 0.58 },
    { name: "Q5", trim: "Premium", class: "suv", msrp: 47500, invoiceFrac: 0.91, desirability: 0.62 },
    { name: "Q7", trim: "Premium", class: "suv", msrp: 62500, invoiceFrac: 0.9, desirability: 0.65 },
    { name: "A5", trim: "Premium Coupe", class: "coupe", msrp: 52000, invoiceFrac: 0.9, desirability: 0.6 },
    { name: "Q8 e-tron", trim: "Premium", class: "ev", msrp: 68500, invoiceFrac: 0.9, desirability: 0.6 },
  ],
  landrover: [
    { name: "Range Rover Evoque", trim: "S", class: "suv", msrp: 52000, invoiceFrac: 0.91, desirability: 0.55 },
    { name: "Discovery", trim: "S", class: "suv", msrp: 62000, invoiceFrac: 0.9, desirability: 0.6 },
    { name: "Defender", trim: "110 S", class: "suv", msrp: 58500, invoiceFrac: 0.9, desirability: 0.7 },
    { name: "Range Rover Sport", trim: "SE", class: "suv", msrp: 87500, invoiceFrac: 0.88, desirability: 0.75 },
    { name: "Range Rover", trim: "SE", class: "suv", msrp: 106500, invoiceFrac: 0.87, desirability: 0.85 },
  ],

  rivian: [
    { name: "R1T", trim: "Dual-Motor", class: "truck", msrp: 74900, invoiceFrac: 0.93, desirability: 0.7 },
    { name: "R1S", trim: "Dual-Motor", class: "suv", msrp: 78900, invoiceFrac: 0.93, desirability: 0.72 },
    { name: "R2", trim: "Launch Edition", class: "suv", msrp: 45000, invoiceFrac: 0.94, desirability: 0.6 },
  ],
  lucid: [
    { name: "Air", trim: "Pure", class: "sedan", msrp: 69900, invoiceFrac: 0.91, desirability: 0.68 },
    { name: "Air", trim: "Touring", class: "sedan", msrp: 77900, invoiceFrac: 0.9, desirability: 0.75 },
    { name: "Gravity", trim: "Grand Touring", class: "suv", msrp: 94900, invoiceFrac: 0.9, desirability: 0.78 },
  ],
  slate: [
    { name: "Slate Truck", trim: "Blank Slate", class: "truck", msrp: 20000, invoiceFrac: 0.96, desirability: 0.4 },
    { name: "Slate Truck", trim: "Accessory Pack", class: "truck", msrp: 27500, invoiceFrac: 0.95, desirability: 0.5 },
  ],
  tesla: [
    { name: "Model 3", trim: "Long Range", class: "sedan", msrp: 42990, invoiceFrac: 0.94, desirability: 0.65 },
    { name: "Model Y", trim: "Long Range", class: "suv", msrp: 47990, invoiceFrac: 0.93, desirability: 0.7 },
    { name: "Model S", trim: "Long Range", class: "sedan", msrp: 74990, invoiceFrac: 0.91, desirability: 0.75 },
    { name: "Model X", trim: "Long Range", class: "suv", msrp: 79990, invoiceFrac: 0.91, desirability: 0.72 },
    { name: "Cybertruck", trim: "All-Wheel Drive", class: "truck", msrp: 79990, invoiceFrac: 0.9, desirability: 0.85 },
  ],
  carvana: [],
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
  { name: "Toyota Camry", class: "sedan" },
  { name: "Toyota RAV4", class: "suv" },
];

export const CUSTOMER_FIRST_NAMES = ["James", "Maria", "David", "Linda", "Robert", "Susan", "Michael", "Karen", "Chris", "Patricia", "Daniel", "Nancy", "Kevin", "Betty", "Brian", "Sandra", "Mark", "Ashley", "Steven", "Emily"];
export const CUSTOMER_LAST_NAMES = ["Nguyen", "Smith", "Garcia", "Johnson", "Brown", "Miller", "Davis", "Wilson", "Anderson", "Thomas", "Moore", "Martin", "Lee", "Walker", "Hall", "Young", "King", "Wright", "Scott", "Torres"];

export const STAFF_FIRST_NAMES = ["Alex", "Jordan", "Taylor", "Casey", "Morgan", "Riley", "Jamie", "Cameron", "Drew", "Sam"];
export const STAFF_LAST_NAMES = ["Reyes", "Coleman", "Patel", "Nguyen", "Okafor", "Fischer", "Rossi", "Novak", "Bianchi", "Suarez"];

// A single flat "overhead" number used to stand in for everything a real
// dealership actually pays for — rent, utilities, property tax, income
// tax — none of which moved with how big or successful the store actually
// was. Broken out into real, separately-scaling line items instead: a
// modest flat G&A baseline every store carries, occupancy and utilities
// that grow with how built-out the facility is, a genuine ad-valorem
// property tax on assessed value, and — the biggest miss — income tax on
// actual profit, which nothing here ever paid before.
export const GENERAL_ADMIN_MONTHLY = 8_000; // phone/internet, office admin, licensing & bonding

export const OCCUPANCY_BASE_MONTHLY = 9_000;
export const OCCUPANCY_PER_FACILITY_POINT = 180; // rent/mortgage scales with facilityStandards (0-100) — the same build-out stat that already drives lot capacity and sales-floor headcount

export const PROPERTY_TAX_ANNUAL_RATE = 0.014; // ~1.4%/yr of assessed value — a realistic blended real-estate tax rate
export const FACILITY_ASSESSED_VALUE_PER_POINT = 15_000; // rough building/improvements value backing the assessment, on top of vehicle inventory actually on hand

export const UTILITIES_BASE_MONTHLY = 2_500;
export const UTILITIES_PER_BAY_MONTHLY = 900; // service bays draw real power, water, and gas
export const UTILITIES_PER_LOT_CAPACITY_UNIT = 40; // a bigger lot needs more lighting and climate control

export const INCOME_TAX_RATE = 0.26; // a realistic blended effective federal + state rate on positive net income

// Dealer holdback: the manufacturer repays a slice of invoice back to the
// dealer, invisible to the customer and excluded from the commissionable
// gross salespeople are paid on (real dealers keep it off the deal jacket
// for exactly that reason) — it's why a store can genuinely make money
// selling "at invoice." Real-world holdback is typically paid quarterly;
// this credits it at time of sale for simplicity, same cash-basis timing
// as every other gross-profit line here.
export const HOLDBACK_RATE = 0.02; // ~2% of invoice, new units only — real-world runs roughly 1-3%

// F&I chargebacks: booked F&I profit isn't fully safe money. An early loan
// payoff (kills reserve income) or a canceled warranty/GAP/maintenance
// product within its window forces a partial refund. Modeled as a flat
// monthly risk against each deal's F&I gross for a couple of years after
// the sale, rather than trying to simulate individual payoff/cancellation
// events — the aggregate exposure is what matters for the P&L.
export const CHARGEBACK_WINDOW_MONTHS = 24;
export const CHARGEBACK_MONTHLY_CHANCE = 0.02; // ~38% cumulative chance any given F&I deal eventually charges back over the full window — in line with real dealer chargeback rates
export const CHARGEBACK_FRACTION = 0.4; // the pro-rated/unearned share of that deal's F&I gross that gets clawed back when it fires
