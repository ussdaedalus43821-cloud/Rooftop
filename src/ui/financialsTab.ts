import type { TabModule } from "./types.js";
import { money } from "./format.js";
import { checkInvariant, totalAssets, totalEquity, totalLiabilities } from "../engine/financials.js";
import { netWorthStanding, computeGroupNetWorth } from "../engine/career.js";
import { renderNetIncomeChart, renderGrossProfitChart } from "./charts.js";

export const financialsTab: TabModule = {
  key: "financials",
  label: "Financials",
  render(ctx) {
    const d = ctx.state.dealerships[ctx.state.activeDealershipId];
    const inv = checkInvariant(d);
    const history = [...d.monthlyHistory].slice(-12).reverse();
    const career = ctx.state.career;

    const groupNetWorth = computeGroupNetWorth(ctx.state);
    const standing = netWorthStanding(groupNetWorth);
    const empireCard = `
      <div class="card">
        <h3>Empire Standing</h3>
        <div class="big-number">${standing.tier.title}</div>
        <div class="sub">Group net worth (all rooftops, treasury, captive lender, warehouse &amp; manufacturer): ${money(groupNetWorth)}</div>
        ${standing.next ? `
        <div class="meter" style="margin-top:8px;"><div style="width:${Math.round(standing.progressToNext * 100)}%"></div></div>
        <div class="sub" style="margin-top:4px;">${money(standing.next.threshold - groupNetWorth > 0 ? standing.next.threshold - groupNetWorth : 0)} to reach "${standing.next.title}"</div>
        ` : `<div class="sub">Top tier reached — from here it's about how big and how many rooftops you can run at once.</div>`}
        <p class="text-faint" style="font-size:11px;margin-top:8px;">There's no finish line in Rooftop — the game keeps giving you more ways to spend and grow: sell a store, build another from scratch, or move cash around your group. This tracks how far that's taken you.</p>
      </div>`;

    const balanceSheet = `
      <div class="card">
        <h3>Balance Sheet</h3>
        <div class="grid grid-cols-3">
          <div>
            <div class="section-title" style="font-size:12px;margin:0 0 6px 0;">Assets</div>
            <table><tbody>
              <tr><td>Cash</td><td class="num">${money(d.ledger.cash)}</td></tr>
              <tr><td>Vehicle Inventory</td><td class="num">${money(d.ledger.vehicleInventoryValue)}</td></tr>
              <tr><td>Parts Inventory</td><td class="num">${money(d.ledger.partsInventoryValue)}</td></tr>
              <tr><td><strong>Total Assets</strong></td><td class="num"><strong>${money(totalAssets(d))}</strong></td></tr>
            </tbody></table>
          </div>
          <div>
            <div class="section-title" style="font-size:12px;margin:0 0 6px 0;">Liabilities</div>
            <table><tbody>
              <tr><td>Floor-Plan Payable</td><td class="num">${money(d.ledger.floorPlanPayable)}</td></tr>
              <tr><td>Accrued Payroll</td><td class="num">${money(d.ledger.accountsPayable)}</td></tr>
              <tr><td>Accrued FP Interest</td><td class="num">${money(d.floorPlan.accruedInterestPayable)}</td></tr>
              <tr><td><strong>Total Liabilities</strong></td><td class="num"><strong>${money(totalLiabilities(d))}</strong></td></tr>
            </tbody></table>
          </div>
          <div>
            <div class="section-title" style="font-size:12px;margin:0 0 6px 0;">Equity</div>
            <table><tbody>
              <tr><td>Owner Contributed</td><td class="num">${money(d.ledger.ownerEquityContributed)}</td></tr>
              <tr><td>Retained Earnings</td><td class="num ${d.ledger.retainedEarnings < 0 ? "text-bad" : ""}">${money(d.ledger.retainedEarnings)}</td></tr>
              <tr><td><strong>Total Equity</strong></td><td class="num"><strong>${money(totalEquity(d))}</strong></td></tr>
            </tbody></table>
          </div>
        </div>
        <div class="card" style="margin-top:12px;background:${inv.balanced ? "var(--good-dim)" : "var(--bad-dim)"};border-color:${inv.balanced ? "var(--good)" : "var(--bad)"};">
          <h3>Balance Check: Assets = Liabilities + Equity</h3>
          <div class="big-number">${money(inv.assets)} ${inv.balanced ? "=" : "≠"} ${money(inv.liabilities + inv.equity)}</div>
          <div class="sub">${inv.balanced ? "The books balance exactly." : `Off by ${money(inv.diff)} — this indicates a bookkeeping bug.`}</div>
        </div>
      </div>`;

    const plTable = `
      <div class="card">
        <h3>Monthly P&amp;L (most recent first)</h3>
        <p class="text-faint" style="font-size:11px;">G&amp;A, Occupancy, Property Tax, and Utilities replaced a single flat "overhead" number — occupancy and utilities grow with facility investment, property tax with assessed value. Income Tax (26% of positive pretax income) is the newest line: it never existed before.</p>
        <div class="table-wrap"><table>
          <thead><tr>
            <th>Month</th><th class="num">Front-End</th><th class="num">F&amp;I</th><th class="num">Service</th><th class="num">Parts</th>
            <th class="num">Payroll</th><th class="num">FP Interest</th><th class="num">G&amp;A</th><th class="num">Occupancy</th><th class="num">Property Tax</th><th class="num">Utilities</th><th class="num">Bonuses</th><th class="num">Income Tax</th><th class="num">Net Income</th><th class="num">Units</th>
          </tr></thead>
          <tbody>
            ${history.length === 0 ? '<tr><td colspan="15" class="list-empty">No completed months yet.</td></tr>' : history.map((m) => `<tr>
              <td>${m.monthLabel}</td>
              <td class="num text-good">${money(m.frontEndGross)}</td>
              <td class="num text-good">${money(m.fiGross)}</td>
              <td class="num text-good">${money(m.serviceGross)}</td>
              <td class="num text-good">${money(m.partsGross)}</td>
              <td class="num text-bad">${money(m.payrollExpense)}</td>
              <td class="num text-bad">${money(m.floorPlanInterestExpense)}</td>
              <td class="num text-bad">${money(m.overheadExpense)}</td>
              <td class="num text-bad">${money(m.occupancyExpense)}</td>
              <td class="num text-bad">${money(m.propertyTaxExpense)}</td>
              <td class="num text-bad">${money(m.utilitiesExpense)}</td>
              <td class="num text-bad">${money(m.incentiveExpense)}</td>
              <td class="num text-bad">${money(m.incomeTaxExpense)}</td>
              <td class="num ${m.netIncome >= 0 ? "text-good" : "text-bad"}"><strong>${money(m.netIncome)}</strong></td>
              <td class="num">${m.unitsSoldNew + m.unitsSoldUsed}</td>
            </tr>`).join("")}
          </tbody>
        </table></div>
      </div>`;

    const trendsCard = `
      <div class="grid grid-cols-2">
        <div class="card">
          <h3>Monthly Net Income</h3>
          ${renderNetIncomeChart(d.monthlyHistory)}
        </div>
        <div class="card">
          <h3>Gross Profit by Department</h3>
          ${renderGrossProfitChart(d.monthlyHistory)}
        </div>
      </div>`;

    const equityStoreName = career.role === "partial_owner" && career.equityDealershipId
      ? ctx.state.dealerships[career.equityDealershipId]?.name
      : undefined;
    const careerCard = `
      <div class="card">
        <h3>Career</h3>
        <div class="grid grid-cols-4">
          <div><div class="text-faint" style="font-size:11px;">Role</div><div class="mono" style="text-transform:capitalize;">${career.role.replace("_", " ")}${career.role !== "gm" ? ` (${Math.round(career.equityPct * 100)}%)` : ""}${equityStoreName ? ` in ${equityStoreName}` : ""}</div></div>
          <div><div class="text-faint" style="font-size:11px;">Bonus Pool Accrued</div><div class="mono text-good">${money(career.bonusPoolAccrued)}</div></div>
          <div><div class="text-faint" style="font-size:11px;">Consecutive Strong Months</div><div class="mono">${career.consecutiveStrongMonths}</div></div>
          <div><div class="text-faint" style="font-size:11px;">Lifetime Owner Distributions</div><div class="mono text-good">${money(career.lifetimeDistributions)}</div></div>
        </div>
      </div>`;

    return `${empireCard}${balanceSheet}<div class="section-title">Profit &amp; Loss</div>${plTable}<div class="section-title">Trends</div>${trendsCard}<div class="section-title">Career</div>${careerCard}`;
  },
};
