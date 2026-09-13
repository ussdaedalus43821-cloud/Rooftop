import type { TabModule } from "./types.js";
import type { Dealership, ReconStage, Vehicle } from "../types.js";
import { meterClass, money } from "./format.js";
import { escapeHtml } from "./app.js";
import {
  allocationCatalog,
  allocationRemainingThisMonth,
  auctionBuyFee,
  auctionLotsForToday,
  orderAllocationUnit,
  bidOnAuctionLot,
} from "../engine/acquisition.js";
import { currentLotUsage, getCurtailmentDue, lotCapacity, payOffHeldUnit, payVehicleCurtailmentInFull } from "../engine/inventory.js";
import { pushToast } from "../engine/engine.js";
import { getFranchiseOption } from "../constants.js";

interface PerfRow {
  key: string;
  name: string;
  trim: string;
  thisMonth: number;
  lastMonth: number;
  grossThisMonth: number;
  avgDays: number;
  onLot: number;
}

/** New models only — matches what Manufacturer Allocation and its auto-pilot actually order. Merges the live catalog (even zero-sale models) with historical modelStats so "what's not moving" shows up, not just what sold. */
function buildPerformanceRows(d: Dealership): PerfRow[] {
  const rows = new Map<string, PerfRow>();
  for (const m of allocationCatalog(d)) {
    const key = `new|${m.name}|${m.trim}`;
    rows.set(key, { key, name: m.name, trim: m.trim, thisMonth: 0, lastMonth: 0, grossThisMonth: 0, avgDays: 0, onLot: 0 });
  }
  for (const stat of Object.values(d.modelStats)) {
    if (stat.condition !== "new") continue;
    rows.set(stat.key, {
      key: stat.key,
      name: stat.name,
      trim: stat.trim,
      thisMonth: stat.unitsSoldThisMonth,
      lastMonth: stat.unitsSoldLastMonth,
      grossThisMonth: stat.grossThisMonth,
      avgDays: stat.unitsSoldAllTime > 0 ? Math.round(stat.daysOnLotSum / stat.unitsSoldAllTime) : 0,
      onLot: 0,
    });
  }
  for (const row of rows.values()) {
    row.onLot = d.vehicles.filter((v) => v.stage !== "sold" && v.condition === "new" && v.model.name === row.name && v.model.trim === row.trim).length;
  }
  return [...rows.values()]
    .filter((r) => r.onLot > 0 || r.thisMonth > 0 || r.lastMonth > 0)
    .sort((a, b) => b.thisMonth - a.thisMonth || b.lastMonth - a.lastMonth || b.onLot - a.onLot);
}

const STAGE_LABELS: Record<ReconStage, string> = {
  acquired: "Acquired",
  inspected: "Inspected",
  reconditioning: "Reconditioning",
  ready: "Ready",
  listed: "Listed",
  sold: "Sold",
};

function vehicleCard(v: Vehicle, dueAmount: number): string {
  const soldWithExposure = v.stage === "sold" && v.floorPlanBalance > 0;
  const badge = soldWithExposure
    ? `<span class="badge badge-bad">SOT ${v.soldOutOfTrustDays}d</span>`
    : v.stage === "sold"
      ? `<span class="badge badge-good">Paid Off</span>`
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
      ${soldWithExposure ? `<div class="actions"><button class="btn btn-sm btn-good" data-action="inventory:payoffHeld" data-vehicle="${v.id}">Pay Off Floor-Plan</button></div>` : ""}
      ${dueAmount > 0 && v.stage !== "sold" ? `<div class="actions"><button class="btn btn-sm btn-warn" data-action="inventory:payCurtailment" data-vehicle="${v.id}">Pay Curtailment ${money(dueAmount)}</button></div>` : ""}
    </div>`;
}

export const inventoryTab: TabModule = {
  key: "inventory",
  label: "Inventory",
  hasAlert(ctx) {
    const d = ctx.state.dealerships[ctx.state.activeDealershipId];
    return d.floorPlan.violationSeverity > 25 || d.vehicles.some((v) => getCurtailmentDue(v, d) > 0);
  },
  render(ctx) {
    const d = ctx.state.dealerships[ctx.state.activeDealershipId];
    const columns: ReconStage[] = ["acquired", "inspected", "reconditioning", "ready", "listed"];
    const heldSold = d.vehicles.filter((v) => v.stage === "sold");

    const capacity = lotCapacity(d);
    const usage = currentLotUsage(d);
    const lotFull = usage >= capacity;
    const remainingPct = 100 - (usage / capacity) * 100;
    const capacityBanner = `
      <div class="card" style="margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
          <div>
            <div class="text-faint" style="font-size:11px;">LOT CAPACITY</div>
            <div class="big-number ${lotFull ? "text-bad" : ""}">${usage}/${capacity}</div>
          </div>
          <div class="meter ${meterClass(remainingPct, 25, 10)}" style="flex:1;min-width:160px;max-width:340px;"><div style="width:${Math.min(100, (usage / capacity) * 100)}%"></div></div>
        </div>
        <p class="text-faint" style="font-size:11.5px;margin:8px 0 0;">Every unsold unit — any recon stage — counts against this, whatever brought it in. ${lotFull ? "Full: factory orders and auction bids are turned away until something sells or moves out." : "Grows with facility investment (Manufacturer Relations tab)."}</p>
      </div>`;

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
        <div class="btn-row" style="margin-bottom:10px;">
          <button class="btn ${d.autoPilot.allocation ? "btn-good" : ""}" data-action="inventory:toggleAllocationAutoPilot">
            Auto-Pilot: ${d.autoPilot.allocation ? "ON — restocking your best sellers" : "OFF — you order yourself"}
          </button>
        </div>
        <p class="text-faint" style="font-size:11.5px;margin:-4px 0 10px;">When on, orders one unit a day of whichever model is selling best (last month's pace, new models get a shot based on desirability), skipping anything already sitting 4+ deep unsold — and pausing on its own once the lot is full.</p>
        <div class="table-wrap"><table>
          <thead><tr><th>Model</th><th>Trim</th><th class="num">Invoice</th><th class="num">MSRP</th><th></th></tr></thead>
          <tbody>
            ${catalog.map((m, i) => `<tr>
              <td>${escapeHtml(m.name)}</td><td>${escapeHtml(m.trim)}</td>
              <td class="num">${money(m.invoice)}</td><td class="num">${money(m.msrp)}</td>
              <td><button class="btn btn-sm btn-primary" data-action="inventory:order" data-model="${i}" ${remaining <= 0 || lotFull ? "disabled" : ""}>Order</button></td>
            </tr>`).join("")}
          </tbody>
        </table></div>
      </div>`;

    const perfRows = buildPerformanceRows(d);
    const performancePanel = `
      <div class="card">
        <h3>Model Performance — New</h3>
        <p class="text-faint" style="font-size:11.5px;">What's actually moving off the lot, by new model and trim — use it to decide what to order (or trust auto-pilot to read it for you).</p>
        ${perfRows.length === 0 ? '<div class="list-empty">No sales history yet.</div>' : `
        <div class="table-wrap"><table>
          <thead><tr><th>Model</th><th class="num">Sold This Mo</th><th class="num">Sold Last Mo</th><th class="num">Gross This Mo</th><th class="num">Avg Days to Sell</th><th class="num">On Lot Now</th><th></th></tr></thead>
          <tbody>
            ${perfRows.map((r) => {
              const slowMover = r.onLot >= 3 && r.thisMonth === 0 && r.lastMonth === 0;
              const hot = r.thisMonth >= 3;
              return `<tr>
                <td>${escapeHtml(r.name)} ${escapeHtml(r.trim)}</td>
                <td class="num">${r.thisMonth}</td>
                <td class="num">${r.lastMonth}</td>
                <td class="num">${money(r.grossThisMonth)}</td>
                <td class="num">${r.avgDays > 0 ? `${r.avgDays}d` : "—"}</td>
                <td class="num">${r.onLot}</td>
                <td>${hot ? '<span class="badge badge-good">Hot</span>' : slowMover ? '<span class="badge badge-bad">Slow Mover</span>' : ""}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table></div>`}
      </div>`;

    const lots = auctionLotsForToday(d, ctx.state.day, ctx.rng);
    const discountPct = d.auctionAutoBidDiscountPct;
    const auctionPanel = `
      <div class="card">
        <h3>Wholesale Auction — Today's Lots</h3>
        <p class="text-faint" style="font-size:11.5px;">A winning bid also carries the auction house's buyer's fee (2% of market value + $150), settled on top of your bid — shown per lot below.</p>
        <div class="btn-row" style="margin-bottom:10px;">
          <button class="btn ${d.autoPilot.auction ? "btn-good" : ""}" data-action="inventory:toggleAuctionAutoPilot">
            Auto-Pilot: ${d.autoPilot.auction ? "ON — bidding for you every day" : "OFF — you bid yourself"}
          </button>
          <label style="display:flex;align-items:center;gap:6px;font-size:12.5px;">
            Bid up to
            <input type="number" min="0" max="40" step="1" style="width:60px;" value="${discountPct}" data-action="inventory:setAuctionDiscount" />
            % below market
          </label>
        </div>
        <p class="text-faint" style="font-size:11.5px;margin:-4px 0 10px;">When on, auto-pilot bids ${discountPct}% below each lot's market value once per day — skipping any lot where that bid falls below the house's minimum, and stopping on its own once the lot is full. Lower the discount to win more often; raise it to hold out for a bigger bargain.</p>
        <div class="table-wrap"><table>
          <thead><tr><th>Vehicle</th><th class="num">Odometer</th><th class="num">Market Value</th><th class="num">Min Bid</th><th class="num">Buyer's Fee</th><th>Your Bid</th><th></th></tr></thead>
          <tbody>
            ${lots.map((lot) => `<tr>
              <td>${escapeHtml(lot.model.name)} ${escapeHtml(lot.model.trim)}</td>
              <td class="num">${lot.odometer.toLocaleString()}</td>
              <td class="num">${money(lot.marketValue)}</td>
              <td class="num">${money(lot.minBid)}</td>
              <td class="num text-faint">+${money(auctionBuyFee(lot))}</td>
              <td><input type="number" step="100" style="width:100px;" id="bid-${lot.id}" value="${lot.minBid}" ${d.autoPilot.auction || lotFull ? "disabled" : ""} /></td>
              <td><button class="btn btn-sm btn-primary" data-action="inventory:bid" data-lot="${lot.id}" ${d.autoPilot.auction || lotFull ? "disabled" : ""}>Bid</button></td>
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

    return `${capacityBanner}${kanban}${performancePanel}<div class="section-title">Acquire Inventory</div><div class="grid grid-cols-2">${allocationPanel}${auctionPanel}</div><div class="section-title">Floor-Plan Management</div>${floorPlanPanel}`;
  },
  onAction(ctx, action, target) {
    const d = ctx.state.dealerships[ctx.state.activeDealershipId];
    if (action === "inventory:order") {
      const idx = Number(target.getAttribute("data-model"));
      const model = allocationCatalog(d)[idx];
      if (!model) return false;
      const v = orderAllocationUnit(d, model, ctx.state.day, ctx.rng);
      const reason = currentLotUsage(d) >= lotCapacity(d) ? "The lot is full — nowhere to put it." : "No allocation remaining this month.";
      pushToast(ctx.state, v ? `Ordered a ${model.name} ${model.trim} from the factory.` : reason, v ? "good" : "warn");
      return true;
    }
    if (action === "inventory:bid") {
      const lotId = target.getAttribute("data-lot")!;
      const input = document.getElementById(`bid-${lotId}`) as HTMLInputElement | null;
      const lots = auctionLotsForToday(d, ctx.state.day, ctx.rng);
      const lot = lots.find((l) => l.id === lotId);
      if (!lot || !input) return false;
      const bid = Number(input.value);
      const result = bidOnAuctionLot(d, lot, bid, ctx.state.day, ctx.rng);
      if (result.won) {
        d.auctionLots = d.auctionLots.filter((l) => l.id !== lotId);
        pushToast(ctx.state, `Won ${lot.model.name} ${lot.model.trim}: bid ${money(bid)} + ${money(result.buyFee)} fee = ${money(result.finalPrice)} total.`, "good");
      } else if (result.lotFull) {
        pushToast(ctx.state, `Won the bid on the ${lot.model.name} ${lot.model.trim}, but the lot is full — nowhere to put it.`, "warn");
      } else {
        pushToast(ctx.state, `Outbid on the ${lot.model.name} ${lot.model.trim}.`, "warn");
      }
      return true;
    }
    if (action === "inventory:toggleAuctionAutoPilot") {
      d.autoPilot.auction = !d.autoPilot.auction;
      return true;
    }
    if (action === "inventory:toggleAllocationAutoPilot") {
      d.autoPilot.allocation = !d.autoPilot.allocation;
      return true;
    }
    if (action === "inventory:payCurtailment") {
      const vid = target.getAttribute("data-vehicle")!;
      const v = d.vehicles.find((x) => x.id === vid);
      if (!v) return false;
      const paid = payVehicleCurtailmentInFull(d, v);
      pushToast(ctx.state, `Paid ${money(paid)} curtailment on ${v.model.name}.`, "good");
      return true;
    }
    if (action === "inventory:payoffHeld") {
      const vid = target.getAttribute("data-vehicle")!;
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
      const vid = target.getAttribute("data-vehicle")!;
      const v = d.vehicles.find((x) => x.id === vid);
      if (!v) return false;
      v.listPrice = Math.max(0, Number(target.value) || 0);
      return false; // avoid re-render fighting the user's typing/focus
    }
    if (action === "inventory:setAuctionDiscount" && target instanceof HTMLInputElement) {
      d.auctionAutoBidDiscountPct = Math.max(0, Math.min(40, Number(target.value) || 0));
      return false; // avoid re-render fighting the user's typing/focus
    }
    return false;
  },
};
