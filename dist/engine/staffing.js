import { STAFF_FIRST_NAMES, STAFF_LAST_NAMES } from "../constants.js";
import { nextId } from "../state.js";
import { postCashExpense } from "./financials.js";
const HIRE_COST = {
    salesperson: 1500,
    fi_manager: 3000,
    service_advisor: 2200,
    service_tech: 2000,
};
const BASE_SALARY = {
    salesperson: 2200,
    fi_manager: 3600,
    service_advisor: 3000,
    service_tech: 3200,
};
const TRAIN_COST = 1800;
export function hireStaff(d, role, rng) {
    const cost = HIRE_COST[role];
    if (d.ledger.cash < cost)
        return null;
    postCashExpense(d, cost);
    const member = {
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
    };
    d.staff.push(member);
    if (role === "service_tech")
        d.service.techs.push(member);
    if (role === "service_advisor")
        d.service.advisors.push(member);
    return member;
}
export function trainStaff(d, staffId) {
    if (d.ledger.cash < TRAIN_COST)
        return false;
    const member = d.staff.find((s) => s.id === staffId);
    if (!member || member.skill >= 98)
        return false;
    postCashExpense(d, TRAIN_COST);
    member.skill = Math.min(99, member.skill + 6);
    member.morale = Math.min(100, member.morale + 3);
    return true;
}
export function fireStaff(d, staffId) {
    d.staff = d.staff.filter((s) => s.id !== staffId);
    d.service.techs = d.service.techs.filter((s) => s.id !== staffId);
    d.service.advisors = d.service.advisors.filter((s) => s.id !== staffId);
}
export function trainCost() {
    return TRAIN_COST;
}
export function hireCost(role) {
    return HIRE_COST[role];
}
//# sourceMappingURL=staffing.js.map