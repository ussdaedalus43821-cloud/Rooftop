import type { TabModule } from "./types.js";
import type { Deal, FourSquareTerms } from "../types.js";
import { money } from "./format.js";
import { escapeHtml } from "./app.js";
import { activeNegotiations, buildTerms, customerTargetPrice, dealsAwaitingFi, submitOffer } from "../engine/salesFloor.js";
import { pushToast } from "../engine/engine.js";
import { hireStaff, trainStaff, fireStaff, trainCost, hireCost } from "../engine/staffing.js";

interface Draft {
  price: number;
  tradeAllowance: number;
  downPayment: number;
  termMonths: number;
}

let selectedDealId: string | null = null;
const drafts = new Map<string, Draft>();

function draftFor(deal: Deal): Draft {
  let draft = drafts.get(deal.id);
  if (!draft) {
    draft = {
      price: deal.terms.price,
      tradeAllowance: deal.terms.tradeAllowance,
      downPayment: deal.terms.downPayment,
      termMonths: deal.terms.termMonths,
    };
    drafts.set(deal.id, draft);
  }
  return draft;
}

function draftToTerms(deal: Deal, draft: Draft): FourSquareTerms {
  return buildTerms(draft.price, draft.tradeAllowance, draft.downPayment, draft.termMonths, deal.terms.aprBuyRate, deal.terms.aprSellRate);
}

export const salesFloorTab: TabModule = {
  key: "salesfloor",
  label: "Sales Floor",
  hasAlert(ctx) {
    const d = ctx.state.dealerships[ctx.state.activeDealershipId];
    return activeNegotiations(d).length > 0;
  },
  render(ctx) {
    const d = ctx.state.dealerships[ctx.state.activeDealershipId];
    const negotiating = activeNegotiations(d);
    const awaitingFi = dealsAwaitingFi(d);

    if (selectedDealId && !negotiating.find((x) => x.id === selectedDealId)) selectedDealId = null;
    const selected = selectedDealId ? negotiating.find((x) => x.id === selectedDealId) ?? null : null;

    const upList = `
      <div class="card">
        <h3>Ups on the Floor (${negotiating.length})</h3>
        ${negotiating.length === 0 ? '<div class="list-empty">No one on the floor right now. Check back after the day advances.</div>' : `
        <table>
          <thead><tr><th>Customer</th><th>Vehicle</th><th>Round</th><th>Rep</th><th></th></tr></thead>
          <tbody>
            ${negotiating.map((deal) => {
              const v = d.vehicles.find((x) => x.id === deal.vehicleId);
              const rep = d.staff.find((s) => s.id === deal.salespersonId);
              return `<tr class="${deal.id === selectedDealId ? "text-good" : ""}">
                <td>${escapeHtml(deal.customer.name)}</td>
                <td>${v ? `${escapeHtml(v.model.name)} ${escapeHtml(v.model.trim)}` : "—"}</td>
                <td>${deal.round}/${deal.customer.patience}</td>
                <td>${rep ? escapeHtml(rep.name) : "—"}</td>
                <td><button class="btn btn-sm btn-primary" data-action="sales:select" data-deal="${deal.id}">Work Deal</button></td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>`}
      </div>`;

    const fiQueue = `
      <div class="card">
        <h3>Awaiting F&amp;I (${awaitingFi.length})</h3>
        ${awaitingFi.length === 0 ? '<div class="list-empty">Nothing waiting.</div>' : `
        <table><tbody>
          ${awaitingFi.map((deal) => `<tr><td>${escapeHtml(deal.customer.name)}</td><td>${money(deal.terms.price)}</td><td class="text-faint">Go to F&amp;I tab</td></tr>`).join("")}
        </tbody></table>`}
      </div>`;

    let dealSheet = "";
    if (selected) {
      const v = d.vehicles.find((x) => x.id === selected.vehicleId);
      if (v) {
        const draft = draftFor(selected);
        const previewTerms = draftToTerms(selected, draft);
        const target = customerTargetPrice(selected.customer, v);

        dealSheet = `
        <div class="section-title">Deal Sheet — ${escapeHtml(selected.customer.name)}</div>
        <div class="customer-panel">
          <div class="customer-avatar">${selected.customer.name.split(" ").map((n) => n[0]).join("")}</div>
          <div class="speech-bubble">
            ${selected.log.slice(-1).map((l) => escapeHtml(l)).join("")}
            <div class="text-faint" style="margin-top:4px;">Budget ~${money(selected.customer.budgetMonthly)}/mo · Credit: ${selected.customer.creditTier}${selected.customer.hasTrade && selected.customer.tradeVehicle ? ` · Trade: ${escapeHtml(selected.customer.tradeVehicle.description)} (they think it's worth ~${money(selected.customer.tradeVehicle.marketValue)})` : " · No trade"} · Round ${selected.round}/${selected.customer.patience}</div>
          </div>
        </div>
        <p class="text-faint" style="font-size:12px;">${escapeHtml(v.model.name)} ${escapeHtml(v.model.trim)} — list ${money(v.listPrice)}, invoice/target ~${money(target)}.</p>
        <div class="four-square">
          <div class="fs-cell">
            <label>Vehicle Price</label>
            <div class="fs-value">${money(draft.price)}</div>
            <input type="number" step="50" min="0" value="${draft.price}" data-action="sales:draftPrice" />
            <div class="fs-sub">Cost basis ${money(v.acquisitionCost + v.reconCost)} · List ${money(v.listPrice)}</div>
          </div>
          <div class="fs-cell">
            <label>Trade Allowance</label>
            <div class="fs-value">${money(draft.tradeAllowance)}</div>
            ${selected.customer.hasTrade ? `<input type="number" step="50" min="0" value="${draft.tradeAllowance}" data-action="sales:draftTrade" />` : '<div class="fs-sub">No trade on this deal</div>'}
          </div>
          <div class="fs-cell">
            <label>Down Payment</label>
            <div class="fs-value">${money(draft.downPayment)}</div>
            <input type="number" step="100" min="0" value="${draft.downPayment}" data-action="sales:draftDown" />
          </div>
          <div class="fs-cell">
            <label>Monthly Payment (${draft.termMonths} mo, ${(previewTerms.aprSellRate * 100).toFixed(1)}% APR)</label>
            <div class="fs-value">${money(previewTerms.monthlyPayment)}/mo</div>
            <select data-action="sales:draftTerm">
              ${[36, 48, 60, 72].map((t) => `<option value="${t}" ${t === draft.termMonths ? "selected" : ""}>${t} months</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="btn-row">
          <button class="btn btn-primary" data-action="sales:presentOffer" data-deal="${selected.id}">Present Offer</button>
          <button class="btn btn-bad" data-action="sales:walkAway" data-deal="${selected.id}">Walk Away</button>
        </div>
        <div class="card" style="margin-top:12px;">
          <h3>Negotiation Log</h3>
          ${selected.log.map((l) => `<div style="font-size:12.5px;margin-bottom:4px;">${escapeHtml(l)}</div>`).join("")}
        </div>`;
      }
    }

    const reps = d.staff.filter((s) => s.role === "salesperson");
    const staffPanel = `
      <div class="section-title">Sales Staff</div>
      <div class="card">
        <table>
          <thead><tr><th>Name</th><th class="num">Skill</th><th class="num">Morale</th><th class="num">Deals MTD</th><th class="num">Gross MTD</th><th></th></tr></thead>
          <tbody>
            ${reps.map((s) => `<tr>
              <td>${escapeHtml(s.name)}</td>
              <td class="num">${Math.round(s.skill)}</td>
              <td class="num">${Math.round(s.morale)}</td>
              <td class="num">${s.dealsThisMonth}</td>
              <td class="num">${money(s.grossThisMonth)}</td>
              <td>
                <button class="btn btn-sm" data-action="sales:train" data-staff="${s.id}">Train ${money(trainCost())}</button>
                <button class="btn btn-sm btn-bad" data-action="sales:fire" data-staff="${s.id}">Let Go</button>
              </td>
            </tr>`).join("")}
          </tbody>
        </table>
        <div class="btn-row"><button class="btn btn-primary" data-action="sales:hire">Hire Salesperson (${money(hireCost("salesperson"))})</button></div>
      </div>`;

    return `<div class="grid grid-cols-2">${upList}${fiQueue}</div>${dealSheet}${staffPanel}`;
  },
  onAction(ctx, action, target) {
    const d = ctx.state.dealerships[ctx.state.activeDealershipId];
    if (action === "sales:select") {
      selectedDealId = target.getAttribute("data-deal");
      return true;
    }
    if (action === "sales:walkAway") {
      const deal = d.deals.find((x) => x.id === target.getAttribute("data-deal"));
      if (deal) {
        deal.stage = "lost";
        deal.log.push(`You end negotiations with ${deal.customer.name}.`);
      }
      selectedDealId = null;
      return true;
    }
    if (action === "sales:presentOffer") {
      const deal = d.deals.find((x) => x.id === target.getAttribute("data-deal"));
      const v = deal ? d.vehicles.find((x) => x.id === deal.vehicleId) : undefined;
      if (!deal || !v) return false;
      const draft = draftFor(deal);
      const terms = draftToTerms(deal, draft);
      const result = submitOffer(d, deal, v, terms, ctx.rng);
      if (result.outcome === "accept") {
        pushToast(ctx.state, `Deal! ${deal.customer.name} agreed to ${money(terms.price)}.`, "good");
        drafts.delete(deal.id);
        selectedDealId = null;
      } else if (result.outcome === "walk") {
        pushToast(ctx.state, `${deal.customer.name} walked away.`, "bad");
        drafts.delete(deal.id);
        selectedDealId = null;
      } else {
        draft.price = deal.terms.price;
        draft.tradeAllowance = deal.terms.tradeAllowance;
      }
      return true;
    }
    if (action === "sales:hire") {
      const hired = hireStaff(d, "salesperson", ctx.rng);
      pushToast(ctx.state, hired ? `Hired ${hired.name}.` : "Not enough cash to hire.", hired ? "good" : "warn");
      return true;
    }
    if (action === "sales:train") {
      const ok = trainStaff(d, target.getAttribute("data-staff")!);
      pushToast(ctx.state, ok ? "Training complete — skill improved." : "Not enough cash to train.", ok ? "good" : "warn");
      return true;
    }
    if (action === "sales:fire") {
      fireStaff(d, target.getAttribute("data-staff")!);
      return true;
    }
    return false;
  },
  onInput(ctx, action, target) {
    const d = ctx.state.dealerships[ctx.state.activeDealershipId];
    const dealId = selectedDealId;
    const deal = dealId ? d.deals.find((x) => x.id === dealId) : undefined;
    if (!deal) return false;
    const draft = draftFor(deal);
    if (action === "sales:draftPrice" && target instanceof HTMLInputElement) {
      draft.price = Number(target.value);
      return true;
    }
    if (action === "sales:draftTrade" && target instanceof HTMLInputElement) {
      draft.tradeAllowance = Number(target.value);
      return true;
    }
    if (action === "sales:draftDown" && target instanceof HTMLInputElement) {
      draft.downPayment = Number(target.value);
      return true;
    }
    if (action === "sales:draftTerm" && target instanceof HTMLSelectElement) {
      draft.termMonths = Number(target.value);
      return true;
    }
    return false;
  },
};
