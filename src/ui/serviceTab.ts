import type { TabModule } from "./types.js";
import { money, pct } from "./format.js";
import { escapeHtml } from "./app.js";
import { hireStaff, trainStaff, fireStaff, trainCost, hireCost } from "../engine/staffing.js";
import { pushToast } from "../engine/engine.js";

export const serviceTab: TabModule = {
  key: "service",
  label: "Service & Parts",
  render(ctx) {
    const d = ctx.state.dealerships[ctx.state.activeDealershipId];
    const jobs = d.service.jobs;
    const warrantyJobs = jobs.filter((j) => j.kind === "warranty").length;
    const customerJobs = jobs.filter((j) => j.kind === "customerPay").length;

    const staffPanel = `
      <div class="card">
        <h3>Technicians &amp; Advisors</h3>
        <p class="text-faint" style="font-size:11.5px;margin:-4px 0 10px;">Skill grows on its own the longer someone's on staff (up to a point) — training just gets them there faster, and is the only way past that point.</p>
        <table>
          <thead><tr><th>Name</th><th>Role</th><th class="num">Skill</th><th class="num">Morale</th><th class="num">Salary/mo</th><th></th></tr></thead>
          <tbody>
            ${[...d.service.techs, ...d.service.advisors].map((s) => `<tr>
              <td>${escapeHtml(s.name)}</td>
              <td>${s.role === "service_tech" ? "Technician" : "Advisor"}</td>
              <td class="num">${Math.round(s.skill)}</td>
              <td class="num">${Math.round(s.morale)}</td>
              <td class="num">${money(s.monthlySalary)}</td>
              <td>
                <button class="btn btn-sm" data-action="service:train" data-staff="${s.id}">Train ${money(trainCost())}</button>
                <button class="btn btn-sm btn-bad" data-action="service:fire" data-staff="${s.id}">Let Go</button>
              </td>
            </tr>`).join("")}
          </tbody>
        </table>
        <div class="btn-row">
          <button class="btn btn-primary" data-action="service:hire" data-role="service_tech">Hire Technician (${money(hireCost("service_tech"))})</button>
          <button class="btn btn-primary" data-action="service:hire" data-role="service_advisor">Hire Advisor (${money(hireCost("service_advisor"))})</button>
        </div>
      </div>`;

    const jobsPanel = `
      <div class="card">
        <h3>Bay Queue (${jobs.length} jobs — ${customerJobs} customer-pay, ${warrantyJobs} warranty)</h3>
        ${jobs.length === 0 ? '<div class="list-empty">No jobs in the queue right now.</div>' : `
        <table>
          <thead><tr><th>Type</th><th class="num">Hours</th><th class="num">Progress</th><th>Parts</th><th class="num">Rate</th></tr></thead>
          <tbody>
            ${jobs.slice(0, 20).map((j) => `<tr>
              <td>${j.kind === "warranty" ? "Warranty" : j.kind === "customerPay" ? "Customer-Pay" : "Recon"}</td>
              <td class="num">${j.hoursRequired.toFixed(1)}</td>
              <td class="num">${Math.round((j.hoursCompleted / j.hoursRequired) * 100)}%</td>
              <td>${j.partsAvailable ? '<span class="badge badge-good">In Stock</span>' : '<span class="badge badge-warn">Special Order</span>'}</td>
              <td class="num">${money(j.laborRate)}/hr</td>
            </tr>`).join("")}
          </tbody>
        </table>`}
      </div>`;

    const partsPanel = `
      <div class="card">
        <h3>Parts Inventory</h3>
        <div class="grid grid-cols-3">
          <div><div class="text-faint" style="font-size:11px;">Stocked Value</div><div class="mono">${money(d.ledger.partsInventoryValue)}</div></div>
          <div><div class="text-faint" style="font-size:11px;">Fill Rate</div><div class="mono">${pct(d.service.parts.fillRate)}</div></div>
          <div><div class="text-faint" style="font-size:11px;">Special-Order Delay</div><div class="mono">${d.service.parts.specialOrderDelayDays}d</div></div>
        </div>
        <div class="form-row" style="margin-top:10px;">
          <label>Target Stock Level (units) — higher stock raises fill rate but ties up cash</label>
          <input type="number" min="100" max="1200" step="25" value="${d.service.parts.targetStockUnits}" data-action="service:setTargetStock" />
        </div>
      </div>`;

    const retentionPanel = `
      <div class="card">
        <h3>Retention &amp; Warranty Economics</h3>
        <div class="grid grid-cols-3">
          <div><div class="text-faint" style="font-size:11px;">Service Retention</div><div class="mono">${pct(d.service.retentionRate)}</div></div>
          <div><div class="text-faint" style="font-size:11px;">Customer-Pay Rate</div><div class="mono">${money(d.service.customerPayRate)}/hr</div></div>
          <div><div class="text-faint" style="font-size:11px;">Warranty Reimbursement</div><div class="mono text-warn">${money(d.service.warrantyRate)}/hr</div></div>
        </div>
        <p class="text-faint" style="font-size:12px;margin-top:8px;">Retained customer base: ${Math.round(d.serviceCustomerBase)} past buyers. This month: customer-pay ${money(d.service.monthlyCustomerPayGross)}, warranty ${money(d.service.monthlyWarrantyGross)}, parts profit ${money(d.service.monthlyPartsGross)}.</p>
      </div>`;

    return `<div class="grid grid-cols-2">${staffPanel}${jobsPanel}</div><div class="grid grid-cols-2" style="margin-top:14px;">${partsPanel}${retentionPanel}</div>`;
  },
  onAction(ctx, action, target) {
    const d = ctx.state.dealerships[ctx.state.activeDealershipId];
    if (action === "service:hire") {
      const role = target.getAttribute("data-role") as any;
      const hired = hireStaff(d, role, ctx.rng);
      pushToast(ctx.state, hired ? `Hired ${hired.name}.` : "Not enough cash to hire.", hired ? "good" : "warn");
      return true;
    }
    if (action === "service:train") {
      const ok = trainStaff(d, target.getAttribute("data-staff")!);
      pushToast(ctx.state, ok ? "Training complete — skill improved." : "Not enough cash to train.", ok ? "good" : "warn");
      return true;
    }
    if (action === "service:fire") {
      fireStaff(d, target.getAttribute("data-staff")!);
      return true;
    }
    return false;
  },
  onInput(ctx, action, target) {
    const d = ctx.state.dealerships[ctx.state.activeDealershipId];
    if (action === "service:setTargetStock" && target instanceof HTMLInputElement) {
      d.service.parts.targetStockUnits = Math.max(100, Math.min(1200, Number(target.value) || 100));
      return true;
    }
    return false;
  },
};
