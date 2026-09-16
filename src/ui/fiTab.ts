import type { TabModule } from "./types.js";
import { money } from "./format.js";
import { escapeHtml } from "./app.js";
import { dealsAwaitingFi } from "../engine/salesFloor.js";
import { buildFiMenu, enterFi, estimateFinanceReserve, finalizeFiAndClose, pitchProduct, setFinanceMarkup } from "../engine/fi.js";
import { originateCaptiveLoan } from "../engine/captiveLender.js";
import { pushToast } from "../engine/engine.js";
import { economyMarginMultiplier } from "../engine/economy.js";
import { hireStaff, trainStaff, fireStaff, trainCost, hireCost } from "../engine/staffing.js";

let selectedDealId: string | null = null;
const markupDrafts = new Map<string, number>();

export const fiTab: TabModule = {
  key: "fi",
  label: "F&I",
  hasAlert(ctx) {
    const d = ctx.state.dealerships[ctx.state.activeDealershipId];
    return dealsAwaitingFi(d).length > 0;
  },
  render(ctx) {
    const d = ctx.state.dealerships[ctx.state.activeDealershipId];
    const queue = dealsAwaitingFi(d);
    if (selectedDealId && !queue.find((x) => x.id === selectedDealId)) selectedDealId = null;
    const selected = selectedDealId ? queue.find((x) => x.id === selectedDealId) ?? null : null;

    const queuePanel = `
      <div class="card">
        <h3>Deals Ready for F&amp;I (${queue.length})</h3>
        ${queue.length === 0 ? '<div class="list-empty">Nothing waiting — close deals on the Sales Floor first.</div>' : `
        <table>
          <thead><tr><th>Customer</th><th class="num">Price</th><th>Stage</th><th></th></tr></thead>
          <tbody>
            ${queue.map((deal) => `<tr>
              <td>${escapeHtml(deal.customer.name)}</td>
              <td class="num">${money(deal.terms.price)}</td>
              <td>${deal.stage === "agreed" ? '<span class="badge badge-neutral">Waiting</span>' : '<span class="badge badge-good">In F&amp;I</span>'}</td>
              <td><button class="btn btn-sm btn-primary" data-action="fi:open" data-deal="${deal.id}">${deal.stage === "agreed" ? "Start F&I" : "Continue"}</button></td>
            </tr>`).join("")}
          </tbody>
        </table>`}
      </div>`;

    const exposure = d.fiChargebackExposure.reduce((sum, e) => sum + e.fiGrossAtRisk, 0);
    const exposureCard = `
      <div class="card">
        <h3>Chargeback Exposure</h3>
        <p class="sub">Booked F&amp;I profit isn't fully safe money — an early loan payoff or a canceled warranty/GAP/maintenance product can claw part of it back for up to 2 years after the sale.</p>
        <div class="grid grid-cols-2">
          <div><div class="text-faint" style="font-size:11px;">Open Exposure</div><div class="mono">${money(exposure)}</div></div>
          <div><div class="text-faint" style="font-size:11px;">Deals At Risk</div><div class="mono">${d.fiChargebackExposure.length}</div></div>
        </div>
      </div>`;

    let panel = "";
    if (selected) {
      const v = d.vehicles.find((x) => x.id === selected.vehicleId);
      if (v && selected.fiProducts.length > 0) {
        const markup = markupDrafts.get(selected.id) ?? Math.round((selected.terms.aprSellRate - selected.terms.aprBuyRate) * 1000) / 10;
        const reserveEstimate = estimateFinanceReserve(selected);
        const productsProfit = selected.fiProducts.filter((p) => p.attached).reduce((s, p) => s + (p.price - p.cost), 0);

        const assignedMgr = selected.fiManagerId ? d.staff.find((s) => s.id === selected.fiManagerId) : undefined;
        panel = `
        <div class="section-title">F&amp;I Desk — ${escapeHtml(selected.customer.name)}${assignedMgr ? ` · ${escapeHtml(assignedMgr.name)}` : ""}</div>
        <div class="grid grid-cols-2">
          <div class="card">
            <h3>Financing</h3>
            <p class="sub">Bank buy rate: ${(selected.terms.aprBuyRate * 100).toFixed(2)}% · Credit tier: ${selected.customer.creditTier}</p>
            <div class="form-row">
              <label>Reserve markup over buy rate (0–3.0%)</label>
              <input type="number" min="0" max="3" step="0.1" value="${markup}" data-action="fi:setMarkup" data-deal="${selected.id}" />
            </div>
            <div class="grid grid-cols-2">
              <div><div class="text-faint" style="font-size:11px;">Customer APR</div><div class="mono">${(selected.terms.aprSellRate * 100).toFixed(2)}%</div></div>
              <div><div class="text-faint" style="font-size:11px;">Monthly Payment</div><div class="mono">${money(selected.terms.monthlyPayment)}</div></div>
              <div><div class="text-faint" style="font-size:11px;">Est. Reserve</div><div class="mono text-good">${money(reserveEstimate)}</div></div>
              <div><div class="text-faint" style="font-size:11px;">Amount Financed</div><div class="mono">${money(Math.max(0, selected.terms.price - selected.terms.tradeAllowance - selected.terms.downPayment))}</div></div>
            </div>
          </div>
          <div class="card">
            <h3>Deal Snapshot</h3>
            <div class="grid grid-cols-2">
              <div><div class="text-faint" style="font-size:11px;">Front-End Gross</div><div class="mono">${money(selected.frontEndGross || (selected.terms.price - v.acquisitionCost - v.reconCost))}</div></div>
              <div><div class="text-faint" style="font-size:11px;">Products Attached Profit</div><div class="mono">${money(productsProfit)}</div></div>
              <div><div class="text-faint" style="font-size:11px;">Total F&amp;I Gross (PVR)</div><div class="mono text-good">${money(reserveEstimate + productsProfit)}</div></div>
            </div>
          </div>
        </div>
        <div class="card">
          <h3>Product Menu</h3>
          <table>
            <thead><tr><th>Product</th><th class="num">Price</th><th class="num">Dealer Cost</th><th class="num">Margin</th><th>Result</th><th></th></tr></thead>
            <tbody>
              ${selected.fiProducts.map((p) => `<tr>
                <td>${escapeHtml(p.label)}</td>
                <td class="num">${money(p.price)}</td>
                <td class="num">${money(p.cost)}</td>
                <td class="num">${money(p.price - p.cost)}</td>
                <td>${p.pitched ? (p.attached ? '<span class="badge badge-good">Attached</span>' : '<span class="badge badge-bad">Declined</span>') : '<span class="badge badge-neutral">Not pitched</span>'}</td>
                <td>${p.pitched ? "" : `<button class="btn btn-sm" data-action="fi:pitch" data-deal="${selected.id}" data-product="${p.key}">Pitch</button>`}</td>
              </tr>`).join("")}
            </tbody>
          </table>
        </div>
        <div class="btn-row">
          <button class="btn btn-primary" data-action="fi:finalize" data-deal="${selected.id}">Finalize &amp; Close Deal</button>
        </div>`;
      }
    }

    const mgrs = d.staff.filter((s) => s.role === "fi_manager");
    const staffPanel = `
      <div class="section-title">F&amp;I Staff</div>
      <div class="card">
        <div class="btn-row" style="margin-bottom:10px;">
          <button class="btn ${d.autoPilot.fi ? "btn-good" : ""}" data-action="fi:toggleAutoPilot">
            Auto-Pilot: ${d.autoPilot.fi ? "ON — your manager runs the desk" : "OFF — you run the desk yourself"}
          </button>
        </div>
        <p class="text-faint" style="font-size:11.5px;margin:-4px 0 10px;">When on, your F&amp;I manager sets the markup and pitches every product on their own each day using their skill — more skilled managers push the reserve harder. Turn it off to run the desk by hand again.</p>
        <p class="text-faint" style="font-size:11.5px;margin:-4px 0 10px;">Skill grows on its own the longer someone's on staff (up to a point) — training just gets them there faster, and is the only way past that point.</p>
        <table>
          <thead><tr><th>Name</th><th class="num">Skill</th><th class="num">Deals MTD</th><th class="num">Gross MTD</th><th></th></tr></thead>
          <tbody>
            ${mgrs.map((s) => `<tr>
              <td>${escapeHtml(s.name)}</td>
              <td class="num">${Math.round(s.skill)}</td>
              <td class="num">${s.dealsThisMonth}</td>
              <td class="num">${money(s.grossThisMonth)}</td>
              <td>
                <button class="btn btn-sm" data-action="fi:train" data-staff="${s.id}">Train ${money(trainCost())}</button>
                <button class="btn btn-sm btn-bad" data-action="fi:fire" data-staff="${s.id}">Let Go</button>
              </td>
            </tr>`).join("")}
          </tbody>
        </table>
        <div class="btn-row"><button class="btn btn-primary" data-action="fi:hire">Hire F&amp;I Manager (${money(hireCost("fi_manager"))})</button></div>
      </div>`;

    return `${queuePanel}${exposureCard}${panel}${staffPanel}`;
  },
  onAction(ctx, action, target) {
    const d = ctx.state.dealerships[ctx.state.activeDealershipId];
    if (action === "fi:open") {
      const deal = d.deals.find((x) => x.id === target.getAttribute("data-deal"));
      if (!deal) return false;
      const v = d.vehicles.find((x) => x.id === deal.vehicleId);
      if (deal.stage === "agreed" && v) {
        enterFi(d, deal);
        if (deal.fiProducts.length === 0) deal.fiProducts = buildFiMenu(v);
      }
      selectedDealId = deal.id;
      return true;
    }
    if (action === "fi:pitch") {
      const deal = d.deals.find((x) => x.id === target.getAttribute("data-deal"));
      const productKey = target.getAttribute("data-product") as any;
      if (!deal) return false;
      const attached = pitchProduct(d, deal, productKey, ctx.rng);
      pushToast(ctx.state, attached ? `${deal.customer.name} added the ${productKey} product.` : `${deal.customer.name} passed on ${productKey}.`, attached ? "good" : "info");
      return true;
    }
    if (action === "fi:finalize") {
      const deal = d.deals.find((x) => x.id === target.getAttribute("data-deal"));
      const v = deal ? d.vehicles.find((x) => x.id === deal.vehicleId) : undefined;
      if (!deal || !v) return false;
      finalizeFiAndClose(d, deal, v, ctx.state.day, ctx.rng, economyMarginMultiplier(ctx.state));
      originateCaptiveLoan(ctx.state, deal);
      pushToast(ctx.state, `Deal closed. Total gross: ${money(deal.frontEndGross + deal.fiGross)}.`, "good");
      markupDrafts.delete(deal.id);
      selectedDealId = null;
      return true;
    }
    if (action === "fi:hire") {
      const hired = hireStaff(d, "fi_manager", ctx.rng);
      pushToast(ctx.state, hired ? `Hired ${hired.name}.` : "Not enough cash to hire.", hired ? "good" : "warn");
      return true;
    }
    if (action === "fi:train") {
      const ok = trainStaff(d, target.getAttribute("data-staff")!);
      pushToast(ctx.state, ok ? "Training complete — skill improved." : "Not enough cash to train.", ok ? "good" : "warn");
      return true;
    }
    if (action === "fi:fire") {
      fireStaff(d, target.getAttribute("data-staff")!);
      return true;
    }
    if (action === "fi:toggleAutoPilot") {
      d.autoPilot.fi = !d.autoPilot.fi;
      return true;
    }
    return false;
  },
  onInput(ctx, action, target) {
    const d = ctx.state.dealerships[ctx.state.activeDealershipId];
    if (action === "fi:setMarkup" && target instanceof HTMLInputElement) {
      const deal = d.deals.find((x) => x.id === target.getAttribute("data-deal"));
      if (!deal) return false;
      const pctVal = Math.max(0, Math.min(3, Number(target.value)));
      markupDrafts.set(deal.id, pctVal);
      setFinanceMarkup(deal, pctVal / 100);
      return true;
    }
    return false;
  },
};
