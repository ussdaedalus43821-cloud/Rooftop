import type { TabModule } from "./types.js";
import type { InsuranceTier } from "../types.js";
import { money } from "./format.js";
import { pushToast } from "../engine/engine.js";
import { AUDIT_FAIL_SEVERITY } from "../constants.js";
import {
  DEDUCTIBLE_OPTIONS,
  computePremiumFor,
  insurableExposure,
  setInsuranceDeductible,
  setInsuranceTier,
} from "../engine/insurance.js";

const TIER_LABEL: Record<InsuranceTier, string> = {
  none: "Uninsured",
  basic: "Basic",
  standard: "Standard",
  premium: "Premium",
};

const TIER_BLURB: Record<InsuranceTier, string> = {
  none: "Self-insured — every loss comes straight out of this store's own cash, in full.",
  basic: "Garage liability + physical damage at policy minimums. Covers the basics; a bad month can still hurt.",
  standard: "Garage liability + physical damage + garagekeepers, at real working limits — the coverage most mid-size stores actually carry.",
  premium: "Full garage package at the highest limits, priced accordingly. Best protection, thinnest margin.",
};

const UNINSURED_GRACE_MONTHS = 6;

export const insuranceTab: TabModule = {
  key: "insurance",
  label: "Insurance",
  render(ctx) {
    const d = ctx.state.dealerships[ctx.state.activeDealershipId];
    const ins = d.insurance;
    const day = ctx.state.day;
    const exposure = insurableExposure(d);
    const currentPremium = computePremiumFor(d, day, ins.tier, ins.deductible);

    const compliance = (() => {
      if (ins.tier !== "none") {
        return `<div class="card"><h3>Lender Compliance</h3><div class="badge badge-good">In compliance</div><p class="text-faint" style="font-size:11.5px;margin-top:8px;">Your floor-plan lender requires insured collateral — you're covered.</p></div>`;
      }
      if (d.ledger.floorPlanPayable <= 0) {
        return `<div class="card"><h3>Lender Compliance</h3><div class="badge badge-warn">Uninsured</div><p class="text-faint" style="font-size:11.5px;margin-top:8px;">No floor-plan debt outstanding right now, so there's nothing at risk yet — but the moment you finance inventory while uninsured, the clock below starts.</p></div>`;
      }
      const overGrace = ins.monthsUninsuredStreak > UNINSURED_GRACE_MONTHS;
      const severityPct = Math.min(100, (d.floorPlan.violationSeverity / AUDIT_FAIL_SEVERITY) * 100);
      return `<div class="card">
        <h3>Lender Compliance</h3>
        <div class="badge ${overGrace ? "badge-bad" : "badge-warn"}">${overGrace ? "Lender has noticed" : "Uninsured — grace period"}</div>
        <p class="text-faint" style="font-size:11.5px;margin:8px 0;">${overGrace
          ? `Your floor-plan lender expects insured collateral, and it's been ${ins.monthsUninsuredStreak} months uninsured with financed inventory on the lot. Audit-risk score is climbing on top of anything curtailments are already adding.`
          : `${ins.monthsUninsuredStreak}/${UNINSURED_GRACE_MONTHS} months uninsured while carrying floor-plan debt. Past month ${UNINSURED_GRACE_MONTHS}, this starts feeding the same audit-risk score a missed curtailment does.`}</p>
        <div class="meter"><div style="width:${severityPct}%;background:${severityPct > 70 ? "var(--bad)" : "var(--warn)"};"></div></div>
        <p class="sub" style="margin-top:4px;">Audit-risk score: ${Math.round(d.floorPlan.violationSeverity)} / ${AUDIT_FAIL_SEVERITY}</p>
      </div>`;
    })();

    const tierCard = `
      <div class="card">
        <h3>Coverage Tier</h3>
        <p class="text-faint" style="font-size:11.5px;">One bundled garage policy — liability, physical damage, and garagekeepers together, the way most dealers this size actually buy it.</p>
        <div class="grid grid-cols-2" style="margin-top:8px;gap:8px;">
          ${(["none", "basic", "standard", "premium"] as InsuranceTier[]).map((tier) => {
            const previewPremium = computePremiumFor(d, day, tier, ins.deductible);
            const active = tier === ins.tier;
            return `
            <button class="card" style="text-align:left;cursor:pointer;width:100%;border-color:${active ? "var(--accent)" : "var(--border)"};background:${active ? "var(--bg-card)" : "var(--bg-panel)"};color:var(--text);" data-action="insurance:setTier" data-tier="${tier}">
              <div style="display:flex;justify-content:space-between;align-items:baseline;">
                <strong>${TIER_LABEL[tier]}</strong>
                ${active ? '<span class="badge badge-good">Active</span>' : ""}
              </div>
              <div class="mono" style="font-size:18px;margin-top:4px;">${tier === "none" ? "$0/mo" : `${money(previewPremium)}/mo`}</div>
              <p class="text-faint" style="font-size:11px;margin-top:6px;">${TIER_BLURB[tier]}</p>
            </button>`;
          }).join("")}
        </div>
      </div>`;

    const deductibleCard = `
      <div class="card">
        <h3>Deductible</h3>
        <p class="text-faint" style="font-size:11.5px;">What this store eats before the policy pays anything on a claim. Higher deductible, lower premium.</p>
        <div class="btn-row" style="margin-top:8px;">
          ${DEDUCTIBLE_OPTIONS.map((amt) => `<button class="btn btn-sm ${amt === ins.deductible ? "btn-good" : ""}" data-action="insurance:setDeductible" data-amount="${amt}" ${ins.tier === "none" ? "disabled" : ""}>${money(amt)}</button>`).join("")}
        </div>
      </div>`;

    const statsCard = `
      <div class="card">
        <h3>This Store's Numbers</h3>
        <div class="grid grid-cols-3">
          <div><div class="text-faint" style="font-size:11px;">Insurable Exposure</div><div class="mono">${money(exposure)}</div></div>
          <div><div class="text-faint" style="font-size:11px;">Current Premium</div><div class="mono ${currentPremium > 0 ? "text-bad" : ""}">${money(currentPremium)}/mo</div></div>
          <div><div class="text-faint" style="font-size:11px;">Deductible</div><div class="mono">${ins.tier === "none" ? "—" : money(ins.deductible)}</div></div>
        </div>
        <div class="grid grid-cols-2" style="margin-top:10px;">
          <div><div class="text-faint" style="font-size:11px;">Lifetime Premiums Paid</div><div class="mono">${money(ins.lifetimePremiumsPaid)}</div></div>
          <div><div class="text-faint" style="font-size:11px;">Lifetime Claims Paid Out</div><div class="mono text-good">${money(ins.lifetimeClaimsPaid)}</div></div>
        </div>
        <p class="text-faint" style="font-size:11px;margin-top:8px;">Exposure is this store's vehicle inventory value plus a per-head allowance for staff — the bigger the lot and the crew, the more there is to insure.</p>
      </div>`;

    const claimsCard = `
      <div class="card">
        <h3>Claims History</h3>
        ${ins.recentClaims.length === 0
          ? '<div class="list-empty">No claims filed yet.</div>'
          : `<table>
              <thead><tr><th>Day</th><th>Cause</th><th class="num">Loss</th><th class="num">Payout</th></tr></thead>
              <tbody>
                ${[...ins.recentClaims].reverse().map((c) => `<tr>
                  <td>${c.day}</td>
                  <td>${c.cause}</td>
                  <td class="num text-bad">${money(c.lossAmount)}</td>
                  <td class="num text-good">${money(c.payout)}</td>
                </tr>`).join("")}
              </tbody>
            </table>`}
      </div>`;

    return `<div class="grid grid-cols-2">${compliance}${statsCard}</div>${tierCard}<div class="grid grid-cols-2" style="margin-top:14px;">${deductibleCard}${claimsCard}</div>`;
  },
  onAction(ctx, action, target) {
    const d = ctx.state.dealerships[ctx.state.activeDealershipId];
    if (action === "insurance:setTier") {
      const tier = target.getAttribute("data-tier") as InsuranceTier;
      setInsuranceTier(d, tier);
      pushToast(ctx.state, tier === "none" ? `${d.name} dropped coverage — every loss now comes straight out of pocket.` : `${d.name} is now on the ${TIER_LABEL[tier]} plan.`, tier === "none" ? "warn" : "good");
      return true;
    }
    if (action === "insurance:setDeductible") {
      const amount = Number(target.getAttribute("data-amount"));
      const ok = setInsuranceDeductible(d, amount);
      if (ok) pushToast(ctx.state, `Deductible set to ${money(amount)}.`, "info");
      return true;
    }
    return false;
  },
};
