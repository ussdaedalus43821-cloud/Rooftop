import type { TabModule } from "./types.js";
import type { Dealership, FranchiseCategory, FranchiseKey } from "../types.js";
import { money, pct, meterClass } from "./format.js";
import { unitsOnLot } from "../engine/inventory.js";
import { activeNegotiations, dealsAwaitingFi } from "../engine/salesFloor.js";
import { checkInvariant } from "../engine/financials.js";
import {
  acquisitionTargetsForMonth,
  buyCompetitorDealership,
  appraiseDealership,
  sellDealership,
  buildNewRooftop,
  newRooftopCost,
  transferToTreasury,
  transferFromTreasury,
  type FundingSource,
} from "../engine/expansion.js";
import { pushToast } from "../engine/engine.js";
import { FRANCHISE_CATEGORIES, franchisesInCategory, getFranchiseOption } from "../constants.js";
import { escapeHtml } from "./app.js";

let treasuryAmountDraft = 10000;
let buildCategory: FranchiseCategory | null = null;
let buildBrand: FranchiseKey | null = null;
let buildFunding: FundingSource = "active";

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
          <thead><tr><th>Rooftop</th><th class="num">Cash</th><th class="num">MTD Net</th><th class="num">CSI</th><th></th></tr></thead>
          <tbody>
            ${Object.values(ctx.state.dealerships).map((x) => `<tr>
              <td>${escapeHtml(x.name)}</td>
              <td class="num">${money(x.ledger.cash)}</td>
              <td class="num ${x.currentMonth.netIncome >= 0 ? "text-good" : "text-bad"}">${money(x.currentMonth.netIncome)}</td>
              <td class="num">${Math.round(x.manufacturer.csi)}</td>
              <td><button class="btn btn-sm btn-bad" data-action="overview:sellDealership" data-target="${x.id}">Sell (~${money(appraiseDealership(x))})</button></td>
            </tr>`).join("")}
          </tbody>
        </table>
        <p class="text-faint" style="font-size:11px;margin-top:8px;">Selling a rooftop closes it for good — the buyer pays roughly its book value plus goodwill, deposited straight into your Group Treasury below.</p>
      </div>` : "";

    const treasuryCard = dealershipCount > 1 ? `
      <div class="card">
        <h3>Group Treasury</h3>
        <div class="big-number">${money(ctx.state.groupTreasury)}</div>
        <p class="text-faint" style="font-size:11.5px;">A shared pool outside any single store's own books — sale proceeds land here, and you can move cash between it and whichever rooftop you're viewing (currently ${escapeHtml(d.name)}).</p>
        <div class="btn-row">
          <input type="number" step="1000" min="0" style="width:120px;" value="${treasuryAmountDraft}" data-action="overview:setTreasuryAmount" />
          <button class="btn btn-sm" data-action="overview:depositTreasury" ${d.ledger.cash < treasuryAmountDraft ? "disabled" : ""}>Deposit from ${escapeHtml(d.name)}</button>
          <button class="btn btn-sm" data-action="overview:withdrawTreasury" ${ctx.state.groupTreasury < treasuryAmountDraft ? "disabled" : ""}>Withdraw to ${escapeHtml(d.name)}</button>
        </div>
      </div>` : "";

    const buildRooftopCard = ctx.state.career.role === "gm" ? "" : (() => {
      const brandChoices = buildCategory ? franchisesInCategory(buildCategory) : [];
      const selectedBrand = buildBrand ? getFranchiseOption(buildBrand) : null;
      const cost = selectedBrand ? newRooftopCost(selectedBrand.key) : 0;
      const affordable = selectedBrand ? (buildFunding === "treasury" ? ctx.state.groupTreasury >= cost : d.ledger.cash >= cost) : false;
      return `
      <div class="card">
        <h3>Build a New Rooftop</h3>
        <p class="text-faint" style="font-size:11.5px;">Stand up a brand-new store from scratch with a fresh franchise — as many times as you can afford, no career milestone required.</p>
        <div class="form-row">
          <select data-action="overview:buildSetCategory">
            <option value="" ${!buildCategory ? "selected" : ""}>— Select a customer base —</option>
            ${FRANCHISE_CATEGORIES.map((c) => `<option value="${c.key}" ${buildCategory === c.key ? "selected" : ""}>${escapeHtml(c.label)}</option>`).join("")}
          </select>
          ${buildCategory ? `
          <select data-action="overview:buildSetBrand">
            <option value="" ${!buildBrand ? "selected" : ""}>— Select a brand —</option>
            ${brandChoices.map((f) => `<option value="${f.key}" ${buildBrand === f.key ? "selected" : ""}>${escapeHtml(f.brand)}</option>`).join("")}
          </select>` : ""}
        </div>
        ${selectedBrand ? `
        <p style="font-size:12.5px;">${escapeHtml(selectedBrand.brand)} start-up cost: <strong>${money(cost)}</strong></p>
        <div class="form-row">
          <label>Pay from:</label>
          <select data-action="overview:buildSetFunding">
            <option value="active" ${buildFunding === "active" ? "selected" : ""}>${escapeHtml(d.name)}'s cash</option>
            <option value="treasury" ${buildFunding === "treasury" ? "selected" : ""}>Group Treasury (${money(ctx.state.groupTreasury)})</option>
          </select>
        </div>
        <div class="btn-row">
          <button class="btn btn-primary" data-action="overview:buildRooftop" ${affordable ? "" : "disabled"}>Break Ground</button>
        </div>` : ""}
      </div>`;
    })();

    const expansionCard = ctx.state.career.role === "gm" ? "" : (() => {
      const targets = acquisitionTargetsForMonth(ctx.state, ctx.rng);
      return `
      <div class="card">
        <h3>Acquire a Competitor</h3>
        <p class="text-faint" style="font-size:11.5px;">Independent rooftops come up for sale from time to time — buy one outright and it folds into your group already stocked and staffed, no starting from scratch. New listings roll in monthly.</p>
        ${targets.length === 0 ? '<div class="list-empty">Nothing on the market right now — check back next month.</div>' : `
        <div class="table-wrap"><table>
          <thead><tr><th>Rooftop</th><th>Brand</th><th>Size</th><th class="num">Vehicles</th><th class="num">Staff</th><th class="num">Reputation</th><th class="num">CSI</th><th class="num">Asking Price</th><th></th></tr></thead>
          <tbody>
            ${targets.map((t) => `<tr>
              <td>${escapeHtml(t.name)}</td>
              <td>${escapeHtml(t.brand)}</td>
              <td style="text-transform:capitalize;">${t.sizeTier}</td>
              <td class="num">${t.vehicleCount}</td>
              <td class="num">${t.staffCount}</td>
              <td class="num">${t.reputation}</td>
              <td class="num">${t.csi}</td>
              <td class="num">${money(t.askingPrice)}</td>
              <td><button class="btn btn-sm btn-primary" data-action="overview:buyCompetitor" data-target="${t.id}" ${d.ledger.cash < t.askingPrice ? "disabled" : ""}>Buy</button></td>
            </tr>`).join("")}
          </tbody>
        </table></div>`}
        <p class="text-faint" style="font-size:11px;margin-top:8px;">Paid in cash from ${escapeHtml(d.name)}'s account — the current store you're viewing.</p>
      </div>`;
    })();

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
      ${treasuryCard}
      ${expansionCard}
      ${buildRooftopCard}
    `;
  },
  onAction(ctx, action, target) {
    if (action === "overview:buyCompetitor") {
      const targetId = target.getAttribute("data-target")!;
      const result = buyCompetitorDealership(ctx.state, ctx.state.activeDealershipId, targetId, ctx.rng);
      pushToast(ctx.state, result.ok ? "Acquired! The new rooftop joins your group." : (result.reason ?? "Couldn't complete the purchase."), result.ok ? "good" : "warn");
      return true;
    }
    if (action === "overview:sellDealership") {
      const targetId = target.getAttribute("data-target")!;
      const sellingD = ctx.state.dealerships[targetId];
      if (!sellingD) return false;
      const preview = appraiseDealership(sellingD);
      if (!confirm(`Sell ${sellingD.name} for roughly ${money(preview)}? This closes the store for good and deposits the proceeds into your Group Treasury.`)) return false;
      const result = sellDealership(ctx.state, targetId);
      pushToast(ctx.state, result.ok ? `Sold for ${money(result.proceeds!)} — deposited into the Group Treasury.` : (result.reason ?? "Couldn't complete the sale."), result.ok ? "good" : "warn");
      return true;
    }
    if (action === "overview:depositTreasury") {
      const ok = transferToTreasury(ctx.state, ctx.state.activeDealershipId, treasuryAmountDraft);
      pushToast(ctx.state, ok ? `${money(treasuryAmountDraft)} moved into the Group Treasury.` : "Not enough cash on hand.", ok ? "good" : "warn");
      return true;
    }
    if (action === "overview:withdrawTreasury") {
      const ok = transferFromTreasury(ctx.state, ctx.state.activeDealershipId, treasuryAmountDraft);
      pushToast(ctx.state, ok ? `${money(treasuryAmountDraft)} moved out of the Group Treasury.` : "Not enough in the Group Treasury.", ok ? "good" : "warn");
      return true;
    }
    if (action === "overview:buildRooftop") {
      if (!buildBrand) return false;
      const result = buildNewRooftop(ctx.state, buildFunding, ctx.state.activeDealershipId, buildBrand, ctx.rng);
      pushToast(ctx.state, result.ok ? "Broke ground on a new rooftop!" : (result.reason ?? "Couldn't build that rooftop."), result.ok ? "good" : "warn");
      if (result.ok) {
        buildCategory = null;
        buildBrand = null;
      }
      return true;
    }
    return false;
  },
  onInput(ctx, action, target) {
    if (action === "overview:setTreasuryAmount" && target instanceof HTMLInputElement) {
      treasuryAmountDraft = Math.max(0, Number(target.value) || 0);
      return true;
    }
    if (action === "overview:buildSetCategory" && target instanceof HTMLSelectElement) {
      buildCategory = (target.value || null) as FranchiseCategory | null;
      buildBrand = null;
      return true;
    }
    if (action === "overview:buildSetBrand" && target instanceof HTMLSelectElement) {
      buildBrand = (target.value || null) as FranchiseKey | null;
      return true;
    }
    if (action === "overview:buildSetFunding" && target instanceof HTMLSelectElement) {
      buildFunding = target.value as FundingSource;
      return true;
    }
    return false;
  },
};
