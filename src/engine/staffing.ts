import type { Dealership, SalesRole, StaffMember } from "../types.js";
import { STAFF_FIRST_NAMES, STAFF_LAST_NAMES } from "../constants.js";
import { Rng } from "../rng.js";
import { nextId } from "../state.js";
import { postCashExpense } from "./financials.js";

const HIRE_COST: Record<SalesRole, number> = {
  salesperson: 1500,
  fi_manager: 3000,
  service_advisor: 2200,
  service_tech: 2000,
  gm: 6000,
};

export const BASE_SALARY: Record<SalesRole, number> = {
  salesperson: 2200,
  fi_manager: 3600,
  service_advisor: 3000,
  service_tech: 3200,
  gm: 5800,
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

export function hireStaff(d: Dealership, role: SalesRole, rng: Rng): StaffMember | null {
  if (role === "gm" && d.staff.some((s) => s.role === "gm")) return null; // one GM seat per store
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
