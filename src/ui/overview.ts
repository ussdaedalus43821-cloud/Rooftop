import type { TabModule } from "./types.js";
import type { Dealership } from "../types.js";
import { money, pct, meterClass } from "./format.js";
import { unitsOnLot } from "../engine/inventory.js";
import { activeNegotiations, dealsAwaitingFi } from "../engine/salesFloor.js";
import { checkInvariant } from "../engine/financials.js";
import { escapeHtml } from "./app.js";

function reconCounts(d: Dealership) {
  const counts = { acquired: 0, inspected: 0, reconditioning: 0, ready: 0, listed: 0 };
  for (const v of d.vehicles) {
    if (v.stage in counts) (counts as any)[v.stage]++;
  }
  return counts;
}

export const overviewTab: TabModule = {
  key: "overview",
  label: "Overview",
  render(ctx) {
    const d = ctx.state.dealerships[ctx.state.activeDealershipId];
    const recon = reconCounts(d);
    const lot = unitsOnLot(d);
    const negotiating = activeNegotiations(d);
    const inFi = dealsAwaitingFi(d);
    const inv = checkInvariant(d);
    const dealershipCount = Object.keys(ctx.state.dealerships).length;

    const groupCard = dealershipCount > 1 ? `
      <div class="card">
        <h3>Dealer Group</h3>
        <table>
          <thead><tr><th>Rooftop</th><th class="num">Cash</th><th class="num">MTD Net</th><th class="num">CSI</th></tr></thead>
          <tbody>
            ${Object.values(ctx.state.dealerships).map((x) => `<tr><td>${escapeHtml(x.name)}</td><td class="num">${money(x.ledger.cash)}</td><td class="num ${x.currentMonth.netIncome >= 0 ? "text-good" : "text-bad"}">${money(x.currentMonth.netIncome)}</td><td class="num">${Math.round(x.manufacturer.csi)}</td></tr>`).join("")}
          </tbody>
        </table>
      </div>` : "";

    return `
      <div class="grid grid-cols-4">
        <div class="card">
          <h3>Cash on Hand</h3>
          <div class="big-number ${d.ledger.cash < 0 ? "text-bad" : ""}">${money(d.ledger.cash)}</div>
          <div class="sub">Floor-plan payable: ${money(d.ledger.floorPlanPayable)}</div>
        </div>
        <div class="card">
          <h3>This Month Net Income</h3>
          <div class="big-number ${d.currentMonth.netIncome >= 0 ? "text-good" : "text-bad"}">${money(d.currentMonth.netIncome)}</div>
          <div class="sub">Gross so far: ${money(d.currentMonth.totalGrossProfit || (d.currentMonth.frontEndGross + d.currentMonth.fiGross + d.currentMonth.serviceGross + d.currentMonth.partsGross))}</div>
        </div>
        <div class="card">
          <h3>Reputation</h3>
          <div class="big-number">${Math.round(d.reputation)}<span style="font-size:14px;color:var(--text-faint)">/100</span></div>
          <div class="meter ${meterClass(d.reputation, 65, 40)}" style="margin-top:8px;"><div style="width:${d.reputation}%"></div></div>
        </div>
        <div class="card">
          <h3>Manufacturer CSI</h3>
          <div class="big-number">${Math.round(d.manufacturer.csi)}<span style="font-size:14px;color:var(--text-faint)">/100</span></div>
          <div class="meter ${meterClass(d.manufacturer.csi, 75, 55)}" style="margin-top:8px;"><div style="width:${d.manufacturer.csi}%"></div></div>
        </div>
      </div>

      <div class="section-title">Today on the Floor</div>
      <div class="grid grid-cols-4">
        <div class="card"><h3>Units on Lot</h3><div class="big-number">${lot.length}</div></div>
        <div class="card"><h3>In Recon Pipeline</h3><div class="big-number">${recon.acquired + recon.inspected + recon.reconditioning}</div></div>
        <div class="card"><h3>Active Negotiations</h3><div class="big-number">${negotiating.length}</div></div>
        <div class="card"><h3>Deals in F&amp;I</h3><div class="big-number">${inFi.length}</div></div>
      </div>

      <div class="section-title">Franchise &amp; Floor-Plan Standing</div>
      <div class="grid grid-cols-3">
        <div class="card">
          <h3>Allocation Tier</h3>
          <div class="big-number" style="text-transform:capitalize;">${d.manufacturer.tier}</div>
          <div class="sub">Quota: ${d.manufacturer.quotaAttainedThisMonth}/${d.manufacturer.quotaUnitsMonthly} units this month</div>
        </div>
        <div class="card">
          <h3>Floor-Plan Audit Risk</h3>
          <div class="big-number ${d.floorPlan.violationSeverity > 50 ? "text-bad" : d.floorPlan.violationSeverity > 20 ? "text-warn" : ""}">${Math.round(d.floorPlan.violationSeverity)}<span style="font-size:14px;color:var(--text-faint)">/100</span></div>
          <div class="sub">${d.floorPlan.holdPayoffs ? '<span class="text-bad">Emergency payoff hold is ACTIVE</span>' : "Payoffs current"}</div>
        </div>
        <div class="card">
          <h3>Balance Check</h3>
          <div class="big-number ${inv.balanced ? "text-good" : "text-bad"}">${inv.balanced ? "✓ Balanced" : "✗ OFF"}</div>
          <div class="sub">A ${money(inv.assets)} = L ${money(inv.liabilities)} + E ${money(inv.equity)}</div>
        </div>
      </div>
      ${groupCard}
    `;
  },
};
