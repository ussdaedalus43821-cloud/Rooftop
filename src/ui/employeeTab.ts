import type { TabModule } from "./types.js";
import type { SalesRole, StaffMember } from "../types.js";
import { money } from "./format.js";
import { escapeHtml } from "./app.js";
import { fireStaff, giveRaise, hireCost, hireStaff, MAX_RAISES, maxSalesStaff, raiseEligible, trainCost, trainStaff } from "../engine/staffing.js";
import { pushToast } from "../engine/engine.js";

const ROLE_LABELS: Record<SalesRole, string> = {
  salesperson: "Salesperson",
  fi_manager: "F&I Manager",
  service_advisor: "Service Advisor",
  service_tech: "Technician",
  gm: "General Manager",
};

const ROLE_ORDER: SalesRole[] = ["gm", "salesperson", "fi_manager", "service_advisor", "service_tech"];

const TRACKS_DEALS: Record<SalesRole, boolean> = {
  salesperson: true,
  fi_manager: true,
  service_advisor: false,
  service_tech: false,
  gm: false,
};

function sortStaff(staff: StaffMember[]): StaffMember[] {
  return [...staff].sort((a, b) => {
    const roleDiff = ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role);
    if (roleDiff !== 0) return roleDiff;
    return b.skill - a.skill;
  });
}

export const employeeTab: TabModule = {
  key: "employees",
  label: "Employees",
  render(ctx) {
    const d = ctx.state.dealerships[ctx.state.activeDealershipId];
    const staff = sortStaff(d.staff);
    const hasGm = d.staff.some((s) => s.role === "gm");
    const canHireGm = ctx.state.career.role !== "gm" && !hasGm;
    const salesCount = d.staff.filter((s) => s.role === "salesperson").length;
    const salesCap = maxSalesStaff(d);
    const atSalesCap = salesCount >= salesCap;

    const rosterCard = `
      <div class="card">
        <h3>Roster</h3>
        <p class="text-faint" style="font-size:11.5px;">Annual salary is base pay only — commission and incentive bonuses are paid on top and shown separately. Skill grows on its own the longer someone's on staff (up to a point); training is the fast track past that. Morale now tracks how the store's been doing — let it sink and a skilled employee is a real flight risk to a rival lot; a long enough career ends in retirement or, for your best people, a shot at General Manager.</p>
        <div class="table-wrap"><table>
          <thead><tr>
            <th>Name</th><th>Role</th><th class="num">Tenure</th><th class="num">Skill</th><th class="num">Morale</th><th class="num">Annual Salary</th><th class="num">Raises</th>
            <th class="num">Deals MTD</th><th class="num">Gross MTD</th><th class="num">Incentives MTD</th><th></th>
          </tr></thead>
          <tbody>
            ${staff.length === 0 ? '<tr><td colspan="11" class="list-empty">No staff yet.</td></tr>' : staff.map((s) => {
              const years = s.experienceDays / 365;
              const tenureLabel = years >= 1 ? `${years.toFixed(1)}y` : `${s.experienceDays}d`;
              const moraleClass = s.morale < 45 ? "text-bad" : s.morale >= 70 ? "text-good" : "";
              const eligible = raiseEligible(s);
              return `<tr>
              <td>${escapeHtml(s.name)}</td>
              <td>${ROLE_LABELS[s.role]}</td>
              <td class="num">${tenureLabel}</td>
              <td class="num">${Math.round(s.skill)}</td>
              <td class="num ${moraleClass}">${Math.round(s.morale)}</td>
              <td class="num">${money(s.monthlySalary * 12)}</td>
              <td class="num" title="${s.meritStreak} consecutive month(s) earning a performance incentive">${s.raisesReceived}/${MAX_RAISES}</td>
              <td class="num">${TRACKS_DEALS[s.role] ? s.dealsThisMonth : "—"}</td>
              <td class="num">${TRACKS_DEALS[s.role] ? money(s.grossThisMonth) : "—"}</td>
              <td class="num text-good">${s.incentivesThisMonth > 0 ? money(s.incentivesThisMonth) : "—"}</td>
              <td>
                <button class="btn btn-sm" data-action="employees:train" data-staff="${s.id}">Train ${money(trainCost())}</button>
                <button class="btn btn-sm ${eligible ? "btn-good" : ""}" data-action="employees:raise" data-staff="${s.id}" ${eligible ? "" : "disabled"}>Give Raise +8%</button>
                <button class="btn btn-sm btn-bad" data-action="employees:fire" data-staff="${s.id}">Let Go</button>
              </td>
            </tr>`;
            }).join("")}
          </tbody>
        </table></div>
      </div>`;

    const hireRow = (role: SalesRole, disabled = false, note = "") => `
      <div>
        <button class="btn btn-sm btn-primary" data-action="employees:hire" data-role="${role}" ${disabled ? "disabled" : ""}>Hire ${ROLE_LABELS[role]} (${money(hireCost(role))})</button>
        ${note ? `<div class="text-faint" style="font-size:11px;margin-top:4px;">${note}</div>` : ""}
      </div>`;

    const hireCard = `
      <div class="card">
        <h3>Hire</h3>
        <div class="grid grid-cols-3" style="gap:14px;">
          ${hireRow("salesperson", atSalesCap, `${salesCount}/${salesCap} sales desks filled — a bigger floor needs facility investment (Manufacturer Relations tab), not just a bigger payroll.`)}
          ${hireRow("fi_manager")}
          ${hireRow("service_advisor")}
          ${hireRow("service_tech")}
          ${hireRow("gm", !canHireGm, hasGm ? "Already staffed — one GM per store." : ctx.state.career.role === "gm" ? "You're running this store yourself as GM." : "Actually runs the place: clears floor-plan curtailment before it becomes a violation every day, sends your weakest staff to training every month, and earns a cut of net income for it.")}
        </div>
      </div>`;

    const incentivesCard = `
      <div class="card">
        <h3>How Incentives Work</h3>
        <table><tbody>
          <tr><td>Top Seller</td><td>Whoever posts the highest gross this month earns an extra 4% of their own number.</td></tr>
          <tr><td>Top F&amp;I Manager</td><td>Same idea — an extra 4% of the month's best F&amp;I gross.</td></tr>
          <tr><td>Aged-Unit Clearance</td><td>Selling a vehicle that's sat 45+ days pays the closing rep a spiff on the spot — up to $1,500 the longer it sat — instead of just leaving it to bleed floor-plan interest.</td></tr>
          <tr><td>Service Pool</td><td>Techs and advisors aren't tracked deal-by-deal, so 3% of the department's combined gross is split across them by skill each month.</td></tr>
          <tr><td>General Manager</td><td>Automatically clears due floor-plan curtailment every day and sends your two weakest staff to training every month, then earns 2% of the store's own net income for the month, whenever it's positive.</td></tr>
          <tr><td>Merit Raises</td><td>Earning any incentive above three months running is a proven track record, not a hot streak — your GM gives them a permanent +8% base-salary raise automatically (up to 5 lifetime). You can also give someone a raise yourself anytime, as a proactive retention play — same cap either way.</td></tr>
        </tbody></table>
      </div>`;

    return `${rosterCard}${hireCard}${incentivesCard}`;
  },
  onAction(ctx, action, target) {
    const d = ctx.state.dealerships[ctx.state.activeDealershipId];
    if (action === "employees:train") {
      const ok = trainStaff(d, target.getAttribute("data-staff")!);
      pushToast(ctx.state, ok ? "Training complete — skill improved." : "Not enough cash to train.", ok ? "good" : "warn");
      return true;
    }
    if (action === "employees:raise") {
      const staffId = target.getAttribute("data-staff")!;
      const member = d.staff.find((s) => s.id === staffId);
      const ok = giveRaise(d, staffId);
      pushToast(ctx.state, ok ? `Gave ${member!.name} a raise — up to $${Math.round(member!.monthlySalary * 12).toLocaleString()}/yr.` : "Already at the lifetime raise cap.", ok ? "good" : "warn");
      return true;
    }
    if (action === "employees:fire") {
      fireStaff(d, target.getAttribute("data-staff")!);
      return true;
    }
    if (action === "employees:hire") {
      const role = target.getAttribute("data-role") as SalesRole;
      const hired = hireStaff(d, role, ctx.rng);
      pushToast(ctx.state, hired ? `Hired ${hired.name}.` : "Couldn't hire — check cash on hand, the sales floor cap, or (for GM) that the seat isn't already filled.", hired ? "good" : "warn");
      return true;
    }
    return false;
  },
};
