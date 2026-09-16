import type { Dealership, GameState, SalesRole, StaffMember } from "../types.js";
import { STAFF_FIRST_NAMES, STAFF_LAST_NAMES } from "../constants.js";
import { Rng } from "../rng.js";
import { nextId } from "../state.js";
import { postCashExpense, reverseDistribution } from "./financials.js";
import { bayCost, effectiveBayHours, investInBay, MAX_BAYS, MAX_SERVICE_QUEUE, techCapacityHours } from "./service.js";

const HIRE_COST: Record<SalesRole, number> = {
  salesperson: 1500,
  fi_manager: 3000,
  service_advisor: 2200,
  service_tech: 2000,
  gm: 6000,
};

// Raised roughly 1.8x from the original figures — payroll is one of the few
// genuinely fixed costs in the game, and at the old scale it was too small
// relative to typical gross profit to meaningfully pressure a bad month
// toward an actual loss. Sized against real-world blended base pay for
// these roles (before commission, which stays separate and variable).
export const BASE_SALARY: Record<SalesRole, number> = {
  salesperson: 4000,
  fi_manager: 6800,
  service_advisor: 5200,
  service_tech: 5500,
  gm: 10_000,
};

const TRAIN_COST = 1800;

// Incentive pay, on top of base salary and (for sales/F&I) commission.
const TOP_SELLER_BONUS_RATE = 0.04; // extra cut of the month's top salesperson's own gross
const TOP_FI_BONUS_RATE = 0.04; // same idea for the top F&I manager
const SERVICE_DEPT_BONUS_RATE = 0.03; // service work isn't attributed per-tech, so this is a shared pool
const GM_BONUS_RATE = 0.02; // share of the store's own net income, before this bonus is deducted
const AGED_UNIT_THRESHOLD_DAYS = 45;
const AGED_UNIT_BASE_BONUS = 150;
const AGED_UNIT_PER_DAY_BONUS = 8;
const AGED_UNIT_MAX_BONUS = 1500;

// Staff get better just by working the job, not only through paid training —
// otherwise a starting or freshly-hired employee is permanently stuck at
// whatever mediocre roll they started with unless you keep paying to train
// them by hand. Natural growth tops out short of elite so training still has
// real value for pushing a team into the 90s quickly.
const EXPERIENCE_SKILL_GAIN_PER_MONTH = 1.5;
const EXPERIENCE_SKILL_CAP = 88;

/** Run once per in-game month: on-the-job skill growth, and reset the MTD deal/gross/incentive counters (previously never reset — deals/gross were quietly lifetime totals). Call this AFTER applyMonthlyIncentives has read this month's numbers. */
export function applyMonthlyStaffCycle(d: Dealership): void {
  for (const s of d.staff) {
    if (s.skill < EXPERIENCE_SKILL_CAP) {
      s.skill = Math.min(EXPERIENCE_SKILL_CAP, s.skill + EXPERIENCE_SKILL_GAIN_PER_MONTH);
    }
    s.dealsThisMonth = 0;
    s.grossThisMonth = 0;
    s.incentivesThisMonth = 0;
  }
}

export interface IncentiveAward {
  name: string;
  label: string; // "Top Seller Bonus", "Service Team Bonus Pool", etc.
  amount: number;
}

export interface IncentiveResult {
  total: number;
  awards: IncentiveAward[];
}

/**
 * Pays out this month's performance bonuses and returns the total (plus a
 * summary of who got what, since applyMonthlyStaffCycle is about to reset
 * incentivesThisMonth back to 0 for the new month — this is the only chance
 * to surface these payouts to the player). Must run before
 * applyMonthlyStaffCycle resets the counters these bonuses read.
 *   - Top Seller / Top F&I: whoever posted the highest gross this month
 *     gets an extra cut of their own number.
 *   - Service pool: techs/advisors aren't individually attributed, so a
 *     shared pool (sized off the department's combined gross) splits by skill.
 *   - GM: a share of the store's own net income for the month, rewarding
 *     overall stewardship rather than any one department.
 */
export function applyMonthlyIncentives(d: Dealership, preIncentiveNetIncome: number): IncentiveResult {
  let total = 0;
  const awards: IncentiveAward[] = [];
  const pay = (member: StaffMember, amount: number, label: string) => {
    if (amount <= 0) return;
    const rounded = Math.round(amount);
    postCashExpense(d, rounded);
    member.incentivesThisMonth += rounded;
    total += rounded;
    awards.push({ name: member.name, label, amount: rounded });
  };

  const topSeller = d.staff
    .filter((s) => s.role === "salesperson" && s.grossThisMonth > 0)
    .sort((a, b) => b.grossThisMonth - a.grossThisMonth)[0];
  if (topSeller) pay(topSeller, topSeller.grossThisMonth * TOP_SELLER_BONUS_RATE, "Top Seller Bonus");

  const topFi = d.staff
    .filter((s) => s.role === "fi_manager" && s.grossThisMonth > 0)
    .sort((a, b) => b.grossThisMonth - a.grossThisMonth)[0];
  if (topFi) pay(topFi, topFi.grossThisMonth * TOP_FI_BONUS_RATE, "Top F&I Bonus");

  const serviceStaff = d.staff.filter((s) => s.role === "service_tech" || s.role === "service_advisor");
  const serviceGrossCombined = d.currentMonth.serviceGross + d.currentMonth.partsGross;
  if (serviceStaff.length > 0 && serviceGrossCombined > 0) {
    const pool = serviceGrossCombined * SERVICE_DEPT_BONUS_RATE;
    const totalSkill = serviceStaff.reduce((sum, s) => sum + s.skill, 0);
    if (totalSkill > 0) {
      let poolPaid = 0;
      for (const s of serviceStaff) {
        const share = Math.round(pool * (s.skill / totalSkill));
        if (share <= 0) continue;
        postCashExpense(d, share);
        s.incentivesThisMonth += share;
        total += share;
        poolPaid += share;
      }
      if (poolPaid > 0) awards.push({ name: `${serviceStaff.length} staff`, label: "Service Team Bonus Pool (split by skill)", amount: poolPaid });
    }
  }

  const gm = d.staff.find((s) => s.role === "gm");
  if (gm && preIncentiveNetIncome > 0) pay(gm, preIncentiveNetIncome * GM_BONUS_RATE, "General Manager Bonus");

  // Earning any incentive this month — a top-seller/F&I bonus, a service
  // pool share, an aged-unit spiff earlier in the month, a GM bonus — is
  // the actual "you demonstrably earned your pay" signal a merit raise
  // should track, rather than inventing a second, parallel performance
  // metric. Anyone who didn't earn one resets to zero: a raise has to be
  // proven again, not coasted on from an old hot streak.
  for (const s of d.staff) {
    s.meritStreak = s.incentivesThisMonth > 0 ? s.meritStreak + 1 : 0;
  }

  return { total, awards };
}

/** Paid immediately at sale time (not part of the monthly cycle) — a spiff for clearing a unit that's been aging on the lot, so it stops racking up floor-plan interest. Returns the amount paid (0 if the unit wasn't old enough or there's no rep to pay). */
export function awardAgedUnitBonus(d: Dealership, rep: StaffMember | undefined, daysInInventory: number): number {
  if (!rep || daysInInventory < AGED_UNIT_THRESHOLD_DAYS) return 0;
  const amount = Math.min(
    AGED_UNIT_MAX_BONUS,
    Math.round(AGED_UNIT_BASE_BONUS + (daysInInventory - AGED_UNIT_THRESHOLD_DAYS) * AGED_UNIT_PER_DAY_BONUS),
  );
  postCashExpense(d, amount);
  rep.incentivesThisMonth += amount;
  return amount;
}

// A GM who does nothing but skim a bonus isn't managing anything — this is
// the actual "manages staff" half of the job. Once a store has a GM on
// staff, up to two of its weakest-skilled people get sent to training each
// month automatically (paid for out of the store's own cash, same cost as
// a manual train click), same as a real GM would run ongoing coaching
// without the owner having to click through every employee by hand. Stops
// once nobody's meaningfully behind (GM_TRAIN_SKILL_THRESHOLD), and never
// drains the store below its own working-capital threshold to do it.
const GM_MAX_TRAINS_PER_MONTH = 2;
const GM_TRAIN_SKILL_THRESHOLD = 70;

// A raise is a real, permanent bump to base salary — the actual
// "pay for performance" lever the one-off monthly incentives above never
// were — earned by sustaining a performance incentive (see meritStreak in
// applyMonthlyIncentives) for several months running, not by one hot
// month. Capped so it compounds into a meaningful but bounded senior-tier
// premium rather than spiraling payroll on a decades-long save.
const RAISE_PCT = 0.08;
const RAISE_STREAK_THRESHOLD = 3;
export const MAX_RAISES = 5;
const RAISE_MORALE_BUMP = 10;

export function raiseEligible(member: StaffMember): boolean {
  return member.raisesReceived < MAX_RAISES;
}

function grantRaise(member: StaffMember): void {
  member.monthlySalary = Math.round(member.monthlySalary * (1 + RAISE_PCT));
  member.raisesReceived += 1;
  member.meritStreak = 0; // has to prove it again for the next one
  member.morale = Math.min(100, member.morale + RAISE_MORALE_BUMP);
}

/** Player-initiated: give someone a raise right now, regardless of their streak — a proactive retention play, not just a reward for hitting a threshold. Still respects the same lifetime cap the automatic path does. */
export function giveRaise(d: Dealership, staffId: string): boolean {
  const member = d.staff.find((s) => s.id === staffId);
  if (!member || !raiseEligible(member)) return false;
  grantRaise(member);
  return true;
}

// A GM watching the shop run a permanent backlog for months on end doesn't
// just shrug it off — they add a bay or bring on another tech, the same way
// they already backfill a departed hire. "Chronic" means the queue is still
// deep at month-end, not a single busy week: checked once a month, at the
// same cadence the rest of a GM's staffing judgment already runs on, so it
// takes a sustained squeeze (not a one-off spike) to trigger real spend.
const SERVICE_BACKLOG_GROWTH_THRESHOLD = 0.85;

// Real shops run something like 1-2 techs per bay; capping there means more
// heads only helps once there's physical bay space to put them in, so a GM
// facing a bay-bound shop expands bays first rather than stacking idle techs.
const MAX_SERVICE_TECHS_PER_BAY = 1.5;

export function maxServiceTechs(d: Dealership): number {
  return Math.max(2, Math.ceil(d.service.bays * MAX_SERVICE_TECHS_PER_BAY));
}

export interface GmStaffManagementResult {
  trained: StaffMember[];
  raised: StaffMember[];
  hiredServiceTechs: StaffMember[];
  investedInBay: boolean;
}

export function applyGmStaffManagement(d: Dealership, rng: Rng): GmStaffManagementResult {
  if (!d.staff.some((s) => s.role === "gm")) return { trained: [], raised: [], hiredServiceTechs: [], investedInBay: false };
  const trained: StaffMember[] = [];
  const candidates = d.staff
    .filter((s) => s.role !== "gm" && s.skill < GM_TRAIN_SKILL_THRESHOLD)
    .sort((a, b) => a.skill - b.skill);
  for (const member of candidates) {
    if (trained.length >= GM_MAX_TRAINS_PER_MONTH) break;
    if (d.ledger.cash - TRAIN_COST < d.autoSweepThreshold) break;
    if (trainStaff(d, member.id)) trained.push(member);
  }

  const raised: StaffMember[] = [];
  for (const member of d.staff) {
    if (member.meritStreak >= RAISE_STREAK_THRESHOLD && raiseEligible(member)) {
      grantRaise(member);
      raised.push(member);
    }
  }

  const hiredServiceTechs: StaffMember[] = [];
  let investedInBay = false;
  if (d.service.jobs.length >= MAX_SERVICE_QUEUE * SERVICE_BACKLOG_GROWTH_THRESHOLD) {
    const bottleneckIsBays = effectiveBayHours(d) <= techCapacityHours(d);
    if (bottleneckIsBays && d.service.bays < MAX_BAYS && d.ledger.cash - bayCost(d) >= d.autoSweepThreshold) {
      if (investInBay(d)) investedInBay = true;
    } else if (d.service.techs.length < maxServiceTechs(d) && d.ledger.cash - HIRE_COST.service_tech >= d.autoSweepThreshold) {
      const hired = hireStaff(d, "service_tech", rng);
      if (hired) hiredServiceTechs.push(hired);
    }
  }

  return { trained, raised, hiredServiceTechs, investedInBay };
}

// Hiring a salesperson has never been bounded by anything but cash — a
// player could staff a small lot with dozens of reps and, since walk-in
// traffic is driven by reputation and lot size rather than headcount (see
// dailyUpCount in salesFloor.ts), that's pure unrealistic waste rather
// than a real lever. This caps the sales floor the same way lot capacity
// itself is capped: a small facility only has so many desks, so much
// parking, so much floor — investing in facility standards is what buys
// room for a bigger team, not just a bigger lot.
const BASE_SALES_STAFF_CAP = 3;
const FACILITY_SALES_STAFF_CAP_PER_POINT = 0.05; // facilityStandards 0-100 adds up to +5 seats at max investment

export function maxSalesStaff(d: Dealership): number {
  return Math.floor(BASE_SALES_STAFF_CAP + d.manufacturer.facilityStandards * FACILITY_SALES_STAFF_CAP_PER_POINT);
}

export function hireStaff(d: Dealership, role: SalesRole, rng: Rng): StaffMember | null {
  if (role === "gm" && d.staff.some((s) => s.role === "gm")) return null; // one GM seat per store
  if (role === "salesperson" && d.staff.filter((s) => s.role === "salesperson").length >= maxSalesStaff(d)) return null;
  const cost = HIRE_COST[role];
  if (d.ledger.cash < cost) return null;
  postCashExpense(d, cost);
  const member: StaffMember = {
    id: nextId("staff"),
    name: `${rng.pick(STAFF_FIRST_NAMES)} ${rng.pick(STAFF_LAST_NAMES)}`,
    role,
    skill: rng.int(35, 55),
    experienceDays: 0,
    morale: rng.int(60, 80),
    monthlySalary: BASE_SALARY[role],
    commissionRate: role === "salesperson" ? 0.2 : role === "fi_manager" ? 0.08 : undefined,
    dealsThisMonth: 0,
    grossThisMonth: 0,
    incentivesThisMonth: 0,
    meritStreak: 0,
    raisesReceived: 0,
  };
  d.staff.push(member);
  if (role === "service_tech") d.service.techs.push(member);
  if (role === "service_advisor") d.service.advisors.push(member);
  return member;
}

export function trainStaff(d: Dealership, staffId: string): boolean {
  if (d.ledger.cash < TRAIN_COST) return false;
  const member = d.staff.find((s) => s.id === staffId);
  if (!member || member.skill >= 98) return false;
  postCashExpense(d, TRAIN_COST);
  member.skill = Math.min(99, member.skill + 6);
  member.morale = Math.min(100, member.morale + 3);
  return true;
}

export function fireStaff(d: Dealership, staffId: string): void {
  d.staff = d.staff.filter((s) => s.id !== staffId);
  d.service.techs = d.service.techs.filter((s) => s.id !== staffId);
  d.service.advisors = d.service.advisors.filter((s) => s.id !== staffId);
}

export function trainCost(): number {
  return TRAIN_COST;
}

export function hireCost(role: SalesRole): number {
  return HIRE_COST[role];
}

// ---------------------------------------------------------------------------
// Employee careers. Staff used to be fixtures: hire once, and absent a
// manual "Let Go" click, the same person sits in the same seat forever —
// morale was tracked (rolled at hire, nudged up by training) but never
// actually read anywhere, so it did nothing. Now it does: a store's own
// monthly performance moves it, and a skilled-but-unhappy employee is a
// real flight risk instead of a permanent fixture. Runs once per in-game
// month, after the month's net income is known.
// ---------------------------------------------------------------------------
const DAYS_PER_YEAR = 365;

// Morale now tracks how the store is actually doing — a losing month stings
// more than a winning one helps, and absent either it drifts back toward a
// neutral baseline rather than getting stuck at whatever it last was.
const MORALE_PROFIT_LIFT = 1.5;
const MORALE_LOSS_DRAG = 3;
const MORALE_BASELINE = 55;
const MORALE_BASELINE_PULL = 0.05;

// A genuine, multi-decade-adjacent career — eligible staff retire out
// cleanly rather than sitting on the roster forever.
const RETIREMENT_ELIGIBLE_DAYS = 15 * DAYS_PER_YEAR;
const RETIREMENT_MONTHLY_CHANCE = 0.03;

// Below this morale, a skilled employee is a real poaching target for a
// rival lot — the better they are, the more likely someone else is
// courting them. Well-treated staff (morale kept up via profitability,
// training, promotion) essentially never leave this way.
const POACH_MORALE_THRESHOLD = 45;
const POACH_BASE_CHANCE = 0.015;
const POACH_SKILL_WEIGHT = 0.06;

// Your own best, most senior non-GM staffer can work their way into an
// open GM seat instead of the owner always hiring a stranger off the
// street — a real promotion path, not just a hire/fire roster.
const PROMOTION_MIN_TENURE_DAYS = 2 * DAYS_PER_YEAR;
const PROMOTION_MIN_SKILL = 75;
const PROMOTION_MONTHLY_CHANCE = 0.12;
const PROMOTION_MORALE_BUMP = 15;

export interface CareerEvent {
  member: StaffMember;
  kind: "retired" | "poached" | "promoted" | "backfilled";
}

/**
 * Covers an essential hire's cost from the store's own cash, and — only if
 * that alone can't cover it — tops up the gap from the pooled Group
 * Treasury, the same pooled-capital principle behind autoRescueDealership.
 * Without this, a store whose cash sits (as it normally does under active
 * treasury sweeping) right at its own auto-sweep cushion can never clear
 * the old "stay above the cushion" guard for a few-thousand-dollar hire,
 * even while the group sits on millions: a real ownership group doesn't
 * let a store go permanently unstaffed over pocket change. Returns false
 * only if neither the store nor the treasury can cover it.
 */
function affordEssentialHire(state: GameState, d: Dealership, cost: number): boolean {
  if (d.ledger.cash >= cost) return true;
  if (!d.autoPilot.treasury) return false;
  const shortfall = cost - d.ledger.cash;
  if (state.groupTreasury < shortfall) return false;
  state.groupTreasury -= shortfall;
  reverseDistribution(d, shortfall);
  return true;
}

/** Run once per in-game month, after net income for the month is finalized. */
export function applyStaffCareerCycle(state: GameState, d: Dealership, rng: Rng): CareerEvent[] {
  const events: CareerEvent[] = [];

  // A store that's lost every last employee — the final retirement or
  // poaching with nobody left to promote or backfill — has no way back on
  // its own: the ordinary GM backfill only runs when a GM is already
  // present to do the hiring. Left unfixed, enough decades of bad luck can
  // permanently brick a store — zero revenue forever, still paying fixed
  // costs, propped up indefinitely by treasury rescue with no path back.
  // A real ownership group facing a fully empty store brings in a manager
  // rather than leaving it derelict; this is that last-resort hire.
  if (d.staff.length === 0) {
    if (affordEssentialHire(state, d, hireCost("gm"))) {
      const hired = hireStaff(d, "gm", rng);
      if (hired) events.push({ member: hired, kind: "backfilled" });
    }
    return events;
  }

  const profitable = d.currentMonth.netIncome > 0;
  for (const s of d.staff) {
    s.morale += profitable ? MORALE_PROFIT_LIFT : -MORALE_LOSS_DRAG;
    s.morale += (MORALE_BASELINE - s.morale) * MORALE_BASELINE_PULL;
    s.morale = Math.max(0, Math.min(100, s.morale));
  }

  // Promotion: a seasoned, high-skill staffer can fill an open GM seat.
  if (!d.staff.some((s) => s.role === "gm")) {
    const candidates = d.staff
      .filter((s) => s.experienceDays >= PROMOTION_MIN_TENURE_DAYS && s.skill >= PROMOTION_MIN_SKILL)
      .sort((a, b) => b.skill - a.skill);
    if (candidates.length > 0 && rng.chance(PROMOTION_MONTHLY_CHANCE)) {
      const promoted = candidates[0];
      promoted.role = "gm";
      promoted.monthlySalary = BASE_SALARY.gm;
      promoted.commissionRate = undefined;
      promoted.morale = Math.min(100, promoted.morale + PROMOTION_MORALE_BUMP);
      d.service.techs = d.service.techs.filter((s) => s.id !== promoted.id);
      d.service.advisors = d.service.advisors.filter((s) => s.id !== promoted.id);
      events.push({ member: promoted, kind: "promoted" });
    }
  }

  // Retirement and poaching — skip anyone just promoted this same cycle.
  const promotedIds = new Set(events.map((e) => e.member.id));
  const departingRoles: SalesRole[] = [];
  for (const s of d.staff) {
    if (promotedIds.has(s.id)) continue;
    if (s.experienceDays >= RETIREMENT_ELIGIBLE_DAYS && rng.chance(RETIREMENT_MONTHLY_CHANCE)) {
      events.push({ member: s, kind: "retired" });
      departingRoles.push(s.role);
      continue;
    }
    if (s.morale < POACH_MORALE_THRESHOLD) {
      const unhappiness = (POACH_MORALE_THRESHOLD - s.morale) / POACH_MORALE_THRESHOLD;
      const chance = POACH_BASE_CHANCE + (s.skill / 100) * POACH_SKILL_WEIGHT * unhappiness;
      if (rng.chance(chance)) {
        events.push({ member: s, kind: "poached" });
        departingRoles.push(s.role);
      }
    }
  }
  for (const event of events) {
    if (event.kind === "retired" || event.kind === "poached") fireStaff(d, event.member.id);
  }

  // A GM keeps the floor staffed — auto-backfills one departure per vacated
  // non-GM role, funding it from the store's own cash or, if that alone
  // falls short, a top-up from the pooled Group Treasury. If the GM itself
  // just left, nobody's left to do this hiring.
  if (d.staff.some((s) => s.role === "gm")) {
    for (const role of departingRoles) {
      if (!affordEssentialHire(state, d, hireCost(role))) continue;
      const hired = hireStaff(d, role, rng);
      if (hired) events.push({ member: hired, kind: "backfilled" });
    }
  }

  // A GM presides over the floor, but without at least one salesperson and
  // one F&I manager the store can't write a single deal — the backfill
  // above only reacts to a departure inside the same monthly cycle, so a
  // store that drifted down to just its GM (retirements/poaching spread
  // across separate months, or the zero-staff emergency hire) never
  // rebuilds on its own and sits as a revenue-dead zombie indefinitely. A
  // real GM restaffs the floor rather than running it solo forever; this
  // rebuilds one missing baseline role per month, same funding rule as
  // ordinary backfill.
  if (d.staff.some((s) => s.role === "gm")) {
    for (const role of ["salesperson", "fi_manager"] as SalesRole[]) {
      if (d.staff.some((s) => s.role === role)) continue;
      if (!affordEssentialHire(state, d, hireCost(role))) continue;
      const hired = hireStaff(d, role, rng);
      if (hired) events.push({ member: hired, kind: "backfilled" });
      break;
    }
  }

  return events;
}
