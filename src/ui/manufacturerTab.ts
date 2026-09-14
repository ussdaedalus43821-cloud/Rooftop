import type { TabModule } from "./types.js";
import { money, meterClass } from "./format.js";
import { facilityInvestmentCost, investInFacilityStandards } from "../engine/manufacturer.js";
import { getFranchiseOption } from "../constants.js";
import { pushToast } from "../engine/engine.js";
import { escapeHtml } from "./app.js";

export const manufacturerTab: TabModule = {
  key: "manufacturer",
  label: "Manufacturer Relations",
  hasAlert(ctx) {
    const d = ctx.state.dealerships[ctx.state.activeDealershipId];
    return d.manufacturer.monthsBelowThreshold >= 2 || d.manufacturer.csi < 60;
  },
  render(ctx) {
    const d = ctx.state.dealerships[ctx.state.activeDealershipId];
    const m = d.manufacturer;

    if (d.isHouseBrand || d.factoryOwned) {
      const mc = ctx.state.manufacturerCo;
      const label = d.isHouseBrand ? mc.brandName : d.brand;
      const noteCard = d.isHouseBrand
        ? `<p>This store sells nothing but your own ${escapeHtml(label)} lineup — no franchise agreement, no tier to climb, no quota to fail. Manage brand reputation, production cost, and factory capacity from the Manufacturing Co. card on Overview.</p>`
        : `<p>You bought ${escapeHtml(label)}'s manufacturing outright and kept it running as its own brand — no termination risk, no compliance grind. Manage its production stats from the Acquired Manufacturer card on Overview.</p>`;
      return `
        <div class="card">
          <h3>${escapeHtml(label)} — ${d.isHouseBrand ? "House Brand" : "Factory-Owned"}</h3>
          ${noteCard}
        </div>
        <div class="grid grid-cols-4">
          <div class="card">
            <h3>${d.isHouseBrand ? "Factory Allocation" : "Allocation Cap"}</h3>
            <div class="big-number">${m.allocationCapMonthly}/mo</div>
            <div class="sub">${d.isHouseBrand ? `Shared across every ${escapeHtml(mc.brandName)} store you run` : "Permanently boosted by owning the factory"}</div>
          </div>
          <div class="card">
            <h3>${d.isHouseBrand ? "Brand Reputation" : "Store Reputation"}</h3>
            <div class="big-number">${Math.round(d.isHouseBrand ? mc.reputation : d.reputation)}<span style="font-size:14px;color:var(--text-faint)">/100</span></div>
            <div class="meter" style="margin-top:8px;"><div style="width:${d.isHouseBrand ? mc.reputation : d.reputation}%"></div></div>
          </div>
          <div class="card">
            <h3>CSI Score</h3>
            <div class="big-number ${m.csi < 60 ? "text-bad" : ""}">${Math.round(m.csi)}</div>
            <div class="meter ${meterClass(m.csi, 75, 55)}" style="margin-top:8px;"><div style="width:${m.csi}%"></div></div>
          </div>
          <div class="card">
            <h3>Facility Standards</h3>
            <div class="big-number">${Math.round(m.facilityStandards)}</div>
            <div class="meter ${meterClass(m.facilityStandards, 70, 50)}" style="margin-top:8px;"><div style="width:${m.facilityStandards}%"></div></div>
            <div class="btn-row">
              <button class="btn btn-primary" data-action="mfr:investFacility" ${d.ledger.cash < facilityInvestmentCost() ? "disabled" : ""}>Invest (${money(facilityInvestmentCost())})</button>
            </div>
          </div>
        </div>
      `;
    }

    const hasNoFranchise = getFranchiseOption(m.franchiseKey).baseQuota === 0;
    const quotaPct = m.quotaUnitsMonthly > 0 ? Math.min(1, m.quotaAttainedThisMonth / m.quotaUnitsMonthly) : 1;

    if (hasNoFranchise) {
      return `
        <div class="card">
          <h3>No Manufacturer Relationship</h3>
          <p>${escapeHtml(d.brand)} is a used-only, direct-to-consumer operation — there's no franchise agreement, no allocation, and no sales quota. Everything here runs on wholesale sourcing, trade-ins, and reconditioning margin.</p>
        </div>
        <div class="grid grid-cols-2">
          <div class="card">
            <h3>CSI Score</h3>
            <div class="big-number ${m.csi < 60 ? "text-bad" : ""}">${Math.round(m.csi)}</div>
            <div class="meter ${meterClass(m.csi, 75, 55)}" style="margin-top:8px;"><div style="width:${m.csi}%"></div></div>
          </div>
          <div class="card">
            <h3>Facility Standards</h3>
            <div class="big-number">${Math.round(m.facilityStandards)}</div>
            <div class="meter ${meterClass(m.facilityStandards, 70, 50)}" style="margin-top:8px;"><div style="width:${m.facilityStandards}%"></div></div>
            <div class="btn-row">
              <button class="btn btn-primary" data-action="mfr:investFacility" ${d.ledger.cash < facilityInvestmentCost() ? "disabled" : ""}>Invest (${money(facilityInvestmentCost())})</button>
            </div>
          </div>
        </div>
      `;
    }

    const statusCard = m.terminated ? `
      <div class="card" style="border-color:var(--bad);">
        <h3 class="text-bad">Franchise Terminated</h3>
        <p>${escapeHtml(d.brand)} has pulled the new-vehicle franchise for chronic underperformance. This store now operates used-vehicles-only — service, F&amp;I, and the used side keep running.</p>
      </div>` : "";

    return `
      ${statusCard}
      <div class="grid grid-cols-4">
        <div class="card">
          <h3>Allocation Tier</h3>
          <div class="big-number" style="text-transform:capitalize;">${m.tier}</div>
          <div class="sub">Cap: ${m.allocationCapMonthly}/mo</div>
        </div>
        <div class="card">
          <h3>Sales Quota</h3>
          <div class="big-number">${m.quotaAttainedThisMonth}/${m.quotaUnitsMonthly}</div>
          <div class="meter ${meterClass(quotaPct, 0.9, 0.6)}" style="margin-top:8px;"><div style="width:${quotaPct * 100}%"></div></div>
        </div>
        <div class="card">
          <h3>CSI Score</h3>
          <div class="big-number ${m.csi < 60 ? "text-bad" : ""}">${Math.round(m.csi)}</div>
          <div class="meter ${meterClass(m.csi, 75, 55)}" style="margin-top:8px;"><div style="width:${m.csi}%"></div></div>
        </div>
        <div class="card">
          <h3>Facility Standards</h3>
          <div class="big-number">${Math.round(m.facilityStandards)}</div>
          <div class="meter ${meterClass(m.facilityStandards, 70, 50)}" style="margin-top:8px;"><div style="width:${m.facilityStandards}%"></div></div>
        </div>
      </div>

      <div class="section-title">Standing</div>
      <div class="grid grid-cols-2">
        <div class="card">
          <h3>Compliance</h3>
          <p class="sub">Strikes accumulated: <strong>${m.complianceStrikes}</strong></p>
          <p class="sub">Months below performance threshold: <strong class="${m.monthsBelowThreshold >= 2 ? "text-bad" : ""}">${m.monthsBelowThreshold}</strong> (4 consecutive months triggers franchise termination)</p>
          <div class="btn-row">
            <button class="btn btn-primary" data-action="mfr:investFacility" ${d.ledger.cash < facilityInvestmentCost() ? "disabled" : ""}>Invest in Facility Standards (${money(facilityInvestmentCost())})</button>
          </div>
        </div>
        <div class="card">
          <h3>Tier History</h3>
          <table><tbody>
            ${m.tierHistory.slice(-6).reverse().map((t) => `<tr><td>Day ${t.day}</td><td style="text-transform:capitalize;">${t.tier}</td></tr>`).join("")}
          </tbody></table>
        </div>
      </div>
    `;
  },
  onAction(ctx, action) {
    const d = ctx.state.dealerships[ctx.state.activeDealershipId];
    if (action === "mfr:investFacility") {
      const ok = investInFacilityStandards(d);
      pushToast(ctx.state, ok ? "Facility upgrade complete." : "Not enough cash.", ok ? "good" : "warn");
      return true;
    }
    return false;
  },
};
