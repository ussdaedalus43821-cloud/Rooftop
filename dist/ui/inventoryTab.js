import { money } from "./format.js";
import { escapeHtml } from "./app.js";
import { allocationCatalog, allocationRemainingThisMonth, generateAuctionLots, orderAllocationUnit, bidOnAuctionLot, } from "../engine/acquisition.js";
import { getCurtailmentDue, payOffHeldUnit, payVehicleCurtailmentInFull } from "../engine/inventory.js";
import { pushToast } from "../engine/engine.js";
import { getFranchiseOption } from "../constants.js";
const lotCache = new Map();
function getLotsForToday(dealershipId, day, rng) {
    const cached = lotCache.get(dealershipId);
    if (cached && cached.day === day)
        return cached.lots;
    const lots = generateAuctionLots(rng, day, 5);
    lotCache.set(dealershipId, { day, lots });
    return lots;
}
const STAGE_LABELS = {
    acquired: "Acquired",
    inspected: "Inspected",
    reconditioning: "Reconditioning",
    ready: "Ready",
    listed: "Listed",
    sold: "Sold",
};
function vehicleCard(v, dueAmount) {
    const badge = v.stage === "sold"
        ? `<span class="badge badge-bad">SOT ${v.soldOutOfTrustDays}d</span>`
        : dueAmount > 0
            ? `<span class="badge badge-warn">Curtailment ${money(dueAmount)}</span>`
            : "";
    return `
    <div class="kanban-card">
      <div class="title">${escapeHtml(v.model.name)} ${escapeHtml(v.model.trim)} ${badge}</div>
      <div class="meta">
        <div>${v.condition === "new" ? "New" : "Used"} · VIN …${v.vin.slice(-6)}</div>
        <div>${v.daysInInventory}d in inventory · FP bal ${money(v.floorPlanBalance)}</div>
        ${v.stage === "listed" ? `<div>List: <input type="number" step="100" style="width:90px;" value="${v.listPrice}" data-action="inventory:setListPrice" data-vehicle="${v.id}" /></div>` : ""}
        ${v.stage === "reconditioning" ? `<div>Recon: ${money(v.reconCost)} / ${money(v.reconCostEstimate)} est.</div>` : ""}
      </div>
      ${v.stage === "sold" ? `<div class="actions"><button class="btn btn-sm btn-good" data-action="inventory:payoffHeld" data-vehicle="${v.id}">Pay Off Floor-Plan</button></div>` : ""}
      ${dueAmount > 0 && v.stage !== "sold" ? `<div class="actions"><button class="btn btn-sm btn-warn" data-action="inventory:payCurtailment" data-vehicle="${v.id}">Pay Curtailment ${money(dueAmount)}</button></div>` : ""}
    </div>`;
}
export const inventoryTab = {
    key: "inventory",
    label: "Inventory",
    hasAlert(ctx) {
        const d = ctx.state.dealerships[ctx.state.activeDealershipId];
        return d.floorPlan.violationSeverity > 25 || d.vehicles.some((v) => getCurtailmentDue(v, d) > 0);
    },
    render(ctx) {
        const d = ctx.state.dealerships[ctx.state.activeDealershipId];
        const columns = ["acquired", "inspected", "reconditioning", "ready", "listed"];
        const heldSold = d.vehicles.filter((v) => v.stage === "sold");
        const kanban = `
      <div class="kanban">
        ${columns.map((stage) => {
            const units = d.vehicles.filter((v) => v.stage === stage);
            return `<div class="kanban-col">
            <h4>${STAGE_LABELS[stage]} <span>${units.length}</span></h4>
            ${units.length === 0 ? '<div class="text-faint" style="font-size:11px;padding:8px;">—</div>' : units.map((v) => vehicleCard(v, getCurtailmentDue(v, d))).join("")}
          </div>`;
        }).join("")}
        <div class="kanban-col">
          <h4>Sold, Held (SOT) <span>${heldSold.length}</span></h4>
          ${heldSold.length === 0 ? '<div class="text-faint" style="font-size:11px;padding:8px;">—</div>' : heldSold.map((v) => vehicleCard(v, 0)).join("")}
        </div>
      </div>`;
        const catalog = allocationCatalog(d);
        const remaining = allocationRemainingThisMonth(d);
        const hasNoFranchise = getFranchiseOption(d.manufacturer.franchiseKey).baseQuota === 0;
        const allocationPanel = d.isUsedOnly ? `<div class="card"><h3>Manufacturer Allocation</h3><p class="text-bad">${hasNoFranchise ? "No manufacturer relationship — this is a used-only, direct-to-consumer store. All inventory comes from auction and trade-ins." : "Franchise terminated — no new-vehicle allocation available. This store is used-only."}</p></div>` : `
      <div class="card">
        <h3>Manufacturer Allocation — ${remaining}/${d.manufacturer.allocationCapMonthly} remaining this month</h3>
        <div class="table-wrap"><table>
          <thead><tr><th>Model</th><th>Trim</th><th class="num">Invoice</th><th class="num">MSRP</th><th></th></tr></thead>
          <tbody>
            ${catalog.map((m, i) => `<tr>
              <td>${escapeHtml(m.name)}</td><td>${escapeHtml(m.trim)}</td>
              <td class="num">${money(m.invoice)}</td><td class="num">${money(m.msrp)}</td>
              <td><button class="btn btn-sm btn-primary" data-action="inventory:order" data-model="${i}" ${remaining <= 0 ? "disabled" : ""}>Order</button></td>
            </tr>`).join("")}
          </tbody>
        </table></div>
      </div>`;
        const lots = getLotsForToday(d.id, ctx.state.day, ctx.rng);
        const auctionPanel = `
      <div class="card">
        <h3>Wholesale Auction — Today's Lots</h3>
        <div class="table-wrap"><table>
          <thead><tr><th>Vehicle</th><th class="num">Odometer</th><th class="num">Market Value</th><th class="num">Min Bid</th><th>Your Bid</th><th></th></tr></thead>
          <tbody>
            ${lots.map((lot) => `<tr>
              <td>${escapeHtml(lot.model.name)} ${escapeHtml(lot.model.trim)}</td>
              <td class="num">${lot.odometer.toLocaleString()}</td>
              <td class="num">${money(lot.marketValue)}</td>
              <td class="num">${money(lot.minBid)}</td>
              <td><input type="number" step="100" style="width:100px;" id="bid-${lot.id}" value="${lot.minBid}" /></td>
              <td><button class="btn btn-sm btn-primary" data-action="inventory:bid" data-lot="${lot.id}">Bid</button></td>
            </tr>`).join("")}
          </tbody>
        </table></div>
      </div>`;
        const floorPlanPanel = `
      <div class="card">
        <h3>Floor-Plan Line</h3>
        <p class="sub">Daily rate ${(d.floorPlan.dailyRate * 365 * 100).toFixed(1)}%/yr · Curtailment kicks in at ${d.floorPlan.curtailmentThresholdDays} days, every ${d.floorPlan.curtailmentIntervalDays} days after (${Math.round(d.floorPlan.curtailmentFraction * 100)}% of original balance per tranche, ${d.floorPlan.curtailmentGraceDays}-day grace).</p>
        <div class="grid grid-cols-3">
          <div><div class="text-faint" style="font-size:11px;">Accrued interest (unpaid)</div><div class="mono">${money(d.floorPlan.accruedInterestPayable)}</div></div>
          <div><div class="text-faint" style="font-size:11px;">Audit risk severity</div><div class="mono ${d.floorPlan.violationSeverity > 50 ? "text-bad" : ""}">${Math.round(d.floorPlan.violationSeverity)}/100</div></div>
          <div><div class="text-faint" style="font-size:11px;">Payable balance</div><div class="mono">${money(d.ledger.floorPlanPayable)}</div></div>
        </div>
        <div class="btn-row">
          <button class="btn ${d.floorPlan.holdPayoffs ? "btn-bad" : ""}" data-action="inventory:toggleHold">
            ${d.floorPlan.holdPayoffs ? "⚠ Emergency: Holding Payoffs — Click to Resume Normal Payoffs" : "Emergency: Hold Floor-Plan Payoffs to Conserve Cash"}
          </button>
        </div>
        <p class="text-faint" style="font-size:11.5px;margin-top:8px;">Holding payoffs keeps sale proceeds in cash but leaves that unit's floor-plan balance outstanding — a live sold-out-of-trust exposure that raises audit risk the longer it's held.</p>
      </div>`;
        return `${kanban}<div class="section-title">Acquire Inventory</div><div class="grid grid-cols-2">${allocationPanel}${auctionPanel}</div><div class="section-title">Floor-Plan Management</div>${floorPlanPanel}`;
    },
    onAction(ctx, action, target) {
        const d = ctx.state.dealerships[ctx.state.activeDealershipId];
        if (action === "inventory:order") {
            const idx = Number(target.getAttribute("data-model"));
            const model = allocationCatalog(d)[idx];
            if (!model)
                return false;
            const v = orderAllocationUnit(d, model, ctx.state.day, ctx.rng);
            pushToast(ctx.state, v ? `Ordered a ${model.name} ${model.trim} from the factory.` : "No allocation remaining this month.", v ? "good" : "warn");
            return true;
        }
        if (action === "inventory:bid") {
            const lotId = target.getAttribute("data-lot");
            const input = document.getElementById(`bid-${lotId}`);
            const lots = getLotsForToday(d.id, ctx.state.day, ctx.rng);
            const lot = lots.find((l) => l.id === lotId);
            if (!lot || !input)
                return false;
            const bid = Number(input.value);
            const result = bidOnAuctionLot(d, lot, bid, ctx.state.day, ctx.rng);
            if (result.won) {
                lotCache.set(d.id, { day: ctx.state.day, lots: lots.filter((l) => l.id !== lotId) });
                pushToast(ctx.state, `Won ${lot.model.name} ${lot.model.trim} at auction for ${money(result.finalPrice)}.`, "good");
            }
            else {
                pushToast(ctx.state, `Outbid on the ${lot.model.name} ${lot.model.trim}.`, "warn");
            }
            return true;
        }
        if (action === "inventory:payCurtailment") {
            const vid = target.getAttribute("data-vehicle");
            const v = d.vehicles.find((x) => x.id === vid);
            if (!v)
                return false;
            const paid = payVehicleCurtailmentInFull(d, v);
            pushToast(ctx.state, `Paid ${money(paid)} curtailment on ${v.model.name}.`, "good");
            return true;
        }
        if (action === "inventory:payoffHeld") {
            const vid = target.getAttribute("data-vehicle");
            payOffHeldUnit(d, vid);
            pushToast(ctx.state, "Floor-plan balance paid off.", "good");
            return true;
        }
        if (action === "inventory:toggleHold") {
            d.floorPlan.holdPayoffs = !d.floorPlan.holdPayoffs;
            return true;
        }
        return false;
    },
    onInput(ctx, action, target) {
        const d = ctx.state.dealerships[ctx.state.activeDealershipId];
        if (action === "inventory:setListPrice" && target instanceof HTMLInputElement) {
            const vid = target.getAttribute("data-vehicle");
            const v = d.vehicles.find((x) => x.id === vid);
            if (!v)
                return false;
            v.listPrice = Math.max(0, Number(target.value) || 0);
            return false; // avoid re-render fighting the user's typing/focus
        }
        return false;
    },
};
//# sourceMappingURL=inventoryTab.js.map