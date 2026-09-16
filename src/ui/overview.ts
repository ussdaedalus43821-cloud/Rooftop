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
import { charterCaptiveLender, charterCaptiveLenderCost, sweepCaptiveLenderCash, type CaptiveLenderFunding } from "../engine/captiveLender.js";
import {
  charterPartsWarehouse,
  charterPartsWarehouseCost,
  sweepPartsWarehouseCash,
  investInWarehouseCapacity,
  capacityUpgradeCost,
  capacityUpgradeMaxed,
  type PartsWarehouseFunding,
} from "../engine/partsWarehouse.js";
import {
  MANUFACTURER_CO_UNLOCK_NET_WORTH,
  manufacturerCoFoundCost,
  manufacturerCoUnlocked,
  foundManufacturerCo,
  houseBrandNewStoreCost,
  foundHouseBrandDealership,
  houseBrandConversionCost,
  convertToHouseBrand,
  rAndDCost,
  rAndDMaxed,
  investInRnD,
  manufacturerCapacityCost,
  manufacturerCapacityMaxed,
  investInManufacturerCapacity,
  marketingCost,
  investInMarketing,
  sweepManufacturerCoCash,
  lineupMaxed,
  monthsSinceFounding,
  newModelUnlockMonths,
  canLaunchNewModel,
  newModelCost,
  launchNewModel,
  nextModelLabel,
  MAX_MANUFACTURER_MODELS,
  type ManufacturerCoFunding,
} from "../engine/manufacturerCo.js";
import { computeGroupNetWorth } from "../engine/career.js";
import { economyMoodLabel } from "../engine/economy.js";
import {
  MANUFACTURER_ACQUISITION_UNLOCK_NET_WORTH,
  acquireManufacturer,
  acquireManufacturerCost,
  manufacturerAcquisitionTargets,
  manufacturerAcquisitionUnlocked,
  sweepAcquiredManufacturerCash,
  type ManufacturerAcquisitionFunding,
} from "../engine/manufacturerAcquisition.js";
import { defendTakeover, type TakeoverDefenseFunding } from "../engine/hostileTakeover.js";
import { pushToast, monthToDateGrossProfit, monthToDateNetIncome } from "../engine/engine.js";
import { FRANCHISE_CATEGORIES, franchisesInCategory, getFranchiseOption } from "../constants.js";
import { escapeHtml } from "./app.js";

let treasuryAmountDraft = 10000;
let buildCategory: FranchiseCategory | null = null;
let buildBrand: FranchiseKey | null = null;
let buildFunding: FundingSource = "active";
let captiveLenderFunding: CaptiveLenderFunding = "active";
let warehouseFunding: PartsWarehouseFunding = "active";
let mfgFunding: ManufacturerCoFunding = "active";
let mfgCategory: FranchiseCategory | null = null;
let mfgBrandNameDraft = "";
let acquireMfgFunding: ManufacturerAcquisitionFunding = "active";
let acquireMfgTarget: FranchiseKey | null = null;
let acquireMfgMerge = false;
let takeoverDefendFunding: TakeoverDefenseFunding = "active";

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

    const econ = ctx.state.economy;
    const era = econ.currentEra;
    const trend = economyMoodLabel(ctx.state);
    const eraClass = era.demandMult >= 1.05 ? "text-good" : era.demandMult < 0.9 ? "text-bad" : "";
    const marketCard = `
      <div class="card">
        <h3>Market Conditions</h3>
        <div class="big-number ${eraClass}">${escapeHtml(era.headline)}</div>
        <p class="text-faint" style="font-size:11.5px;margin:6px 0 0;">${escapeHtml(era.description)}</p>
        <div class="sub" style="margin-top:8px;">Sentiment trending: ${trend} (${econ.sentiment.toFixed(2)}×) · this era runs through day ${era.endDay}</div>
        ${econ.eraLog.length > 0 ? `
          <details style="margin-top:8px;">
            <summary style="cursor:pointer;font-size:11.5px;color:var(--text-faint);">Economic history this game</summary>
            <table><tbody>
              ${econ.eraLog.slice().reverse().map((e) => `<tr><td class="text-faint" style="font-size:11px;">Day ${e.day}</td><td style="font-size:11.5px;">${escapeHtml(e.headline)}</td></tr>`).join("")}
            </tbody></table>
          </details>
        ` : ""}
      </div>`;

    const threat = ctx.state.takeoverThreat;
    const takeoverCard = threat ? (() => {
      const targetD = ctx.state.dealerships[threat.targetDealershipId];
      if (!targetD) return "";
      const daysLeft = Math.max(0, threat.deadlineDay - ctx.state.day);
      const affordable = takeoverDefendFunding === "treasury" ? ctx.state.groupTreasury >= threat.defendCost : d.ledger.cash >= threat.defendCost;
      return `
      <div class="card" style="border-color:var(--bad);">
        <h3 class="text-bad">Hostile Takeover — ${escapeHtml(threat.rivalName)}</h3>
        <p>${threat.scope === "group" ? "A determined rival is making a play for" : "A rival is circling"} <strong>${escapeHtml(targetD.name)}</strong>${threat.scope === "group" ? ", your most valuable rooftop" : ", your weakest rooftop"}. Left undefended, they'll force a sale for ${money(threat.forcedPrice)} — well below what it's worth.</p>
        <p class="sub"><strong>${daysLeft}</strong> day${daysLeft === 1 ? "" : "s"} left to respond.</p>
        <div class="form-row">
          <label>Defend using:</label>
          <select data-action="overview:takeoverFundingSource">
            <option value="active" ${takeoverDefendFunding === "active" ? "selected" : ""}>${escapeHtml(d.name)}'s cash</option>
            <option value="treasury" ${takeoverDefendFunding === "treasury" ? "selected" : ""}>Group Treasury (${money(ctx.state.groupTreasury)})</option>
          </select>
        </div>
        <div class="btn-row">
          <button class="btn btn-primary" data-action="overview:defendTakeover" ${affordable ? "" : "disabled"}>Defend ${escapeHtml(targetD.name)} (${money(threat.defendCost)})</button>
        </div>
      </div>`;
    })() : "";

    const groupCard = dealershipCount > 1 ? `
      <div class="card">
        <h3>Dealer Group</h3>
        <table>
          <thead><tr><th>Rooftop</th><th class="num">Cash</th><th class="num">MTD Net</th><th class="num">CSI</th><th></th></tr></thead>
          <tbody>
            ${Object.values(ctx.state.dealerships).map((x) => `<tr>
              <td>${escapeHtml(x.name)}</td>
              <td class="num">${money(x.ledger.cash)}</td>
              <td class="num ${monthToDateNetIncome(x) >= 0 ? "text-good" : "text-bad"}">${money(monthToDateNetIncome(x))}</td>
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
        <div class="btn-row" style="margin-top:10px;align-items:center;">
          <button class="btn btn-sm ${d.autoPilot.treasury ? "btn-good" : ""}" data-action="overview:toggleTreasuryAutoPilot">
            Treasury Auto-Pilot ${escapeHtml(d.name)}: ${d.autoPilot.treasury ? "ON" : "OFF"}
          </button>
          <label style="display:flex;align-items:center;gap:6px;font-size:12.5px;">
            keep
            <input type="number" step="10000" min="0" style="width:110px;" value="${d.autoSweepThreshold}" data-action="overview:setSweepThreshold" />
            for itself
          </label>
        </div>
        <p class="text-faint" style="font-size:11px;margin-top:6px;">Works both ways: at month's end, a store above its threshold sweeps the surplus into the Treasury; on any day it falls short of its threshold, it's automatically topped back up out of the Treasury (as far as the Treasury can cover) — a struggling store can save itself before it ever misses a curtailment payment. No more moving cash by hand store by store.</p>
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

    const captiveLenderCard = ctx.state.career.role === "gm" ? "" : (() => {
      const lender = ctx.state.captiveLender;
      const cost = charterCaptiveLenderCost();
      if (!lender.chartered) {
        const affordable = captiveLenderFunding === "treasury" ? ctx.state.groupTreasury >= cost : d.ledger.cash >= cost;
        return `
        <div class="card">
          <h3>Captive Finance Company</h3>
          <p class="text-faint" style="font-size:11.5px;">Right now, every customer you finance has their loan wholesaled off to some outside bank — you collect a one-time reserve fee at signing and every dollar of interest after that just isn't yours. Charter your own captive lender (think Ford Credit, Toyota Financial Services) and every deal financed anywhere in your group, from now on, becomes a loan on <em>your</em> books instead — interest income lands every month, for as long as that loan is outstanding.</p>
          <p style="font-size:12.5px;">Charter cost: <strong>${money(cost)}</strong></p>
          <div class="form-row">
            <label>Pay from:</label>
            <select data-action="overview:captiveFundingSource">
              <option value="active" ${captiveLenderFunding === "active" ? "selected" : ""}>${escapeHtml(d.name)}'s cash</option>
              <option value="treasury" ${captiveLenderFunding === "treasury" ? "selected" : ""}>Group Treasury (${money(ctx.state.groupTreasury)})</option>
            </select>
          </div>
          <div class="btn-row">
            <button class="btn btn-primary" data-action="overview:charterCaptiveLender" ${affordable ? "" : "disabled"}>Charter A Captive Lender</button>
          </div>
        </div>`;
      }
      return `
      <div class="card">
        <h3>Captive Finance Company</h3>
        <div class="grid grid-cols-3">
          <div><div class="text-faint" style="font-size:11px;">Outstanding Portfolio</div><div class="mono">${money(lender.portfolioPrincipal)}</div></div>
          <div><div class="text-faint" style="font-size:11px;">Blended APR</div><div class="mono">${pct(lender.weightedApr, 1)}</div></div>
          <div><div class="text-faint" style="font-size:11px;">Uncollected Cash</div><div class="mono text-good">${money(lender.cash)}</div></div>
        </div>
        <div class="grid grid-cols-3" style="margin-top:10px;">
          <div><div class="text-faint" style="font-size:11px;">Last Month Interest Income</div><div class="mono text-good">${money(lender.lastMonthInterestIncome)}</div></div>
          <div><div class="text-faint" style="font-size:11px;">Last Month Charge-Offs</div><div class="mono ${lender.lastMonthChargeOffs > 0 ? "text-bad" : ""}">${money(lender.lastMonthChargeOffs)}</div></div>
          <div><div class="text-faint" style="font-size:11px;">Lifetime Interest Income</div><div class="mono">${money(lender.lifetimeInterestIncome)}</div></div>
        </div>
        <p class="text-faint" style="font-size:11px;margin-top:8px;">Every deal financed anywhere in your group feeds this portfolio. It runs passively — nothing to manage day-to-day — just sweep the interest it earns into your Group Treasury whenever you want to put it to work.</p>
        <div class="btn-row">
          <button class="btn btn-sm btn-primary" data-action="overview:sweepCaptiveLender" ${lender.cash <= 0 ? "disabled" : ""}>Sweep ${money(lender.cash)} To Treasury</button>
        </div>
      </div>`;
    })();

    const partsWarehouseCard = ctx.state.career.role === "gm" ? "" : (() => {
      const wh = ctx.state.partsWarehouse;
      const cost = charterPartsWarehouseCost();
      if (!wh.chartered) {
        const affordable = warehouseFunding === "treasury" ? ctx.state.groupTreasury >= cost : d.ledger.cash >= cost;
        return `
        <div class="card">
          <h3>Parts Warehouse</h3>
          <p class="text-faint" style="font-size:11.5px;">Every store in your group restocks parts at retail price right now. Charter a distribution warehouse and every rooftop buys wholesale instead — a real, ongoing savings that scales with how many stores you own — and whatever capacity your group doesn't use gets sold to outside shops for pure profit.</p>
          <p style="font-size:12.5px;">Charter cost: <strong>${money(cost)}</strong></p>
          <div class="form-row">
            <label>Pay from:</label>
            <select data-action="overview:warehouseFundingSource">
              <option value="active" ${warehouseFunding === "active" ? "selected" : ""}>${escapeHtml(d.name)}'s cash</option>
              <option value="treasury" ${warehouseFunding === "treasury" ? "selected" : ""}>Group Treasury (${money(ctx.state.groupTreasury)})</option>
            </select>
          </div>
          <div class="btn-row">
            <button class="btn btn-primary" data-action="overview:charterPartsWarehouse" ${affordable ? "" : "disabled"}>Charter A Parts Warehouse</button>
          </div>
        </div>`;
      }
      const upgradeCost = capacityUpgradeCost(ctx.state);
      const maxed = capacityUpgradeMaxed(ctx.state);
      return `
      <div class="card">
        <h3>Parts Warehouse</h3>
        <div class="grid grid-cols-3">
          <div><div class="text-faint" style="font-size:11px;">Monthly Throughput</div><div class="mono">${wh.throughputCapacity.toLocaleString()} units</div></div>
          <div><div class="text-faint" style="font-size:11px;">Group Savings Last Month</div><div class="mono text-good">${money(wh.lastMonthInternalSavings)}</div></div>
          <div><div class="text-faint" style="font-size:11px;">Uncollected Cash</div><div class="mono text-good">${money(wh.cash)}</div></div>
        </div>
        <div class="grid grid-cols-3" style="margin-top:10px;">
          <div><div class="text-faint" style="font-size:11px;">External Sales Last Month</div><div class="mono">${Math.round(wh.lastMonthExternalUnits).toLocaleString()} units</div></div>
          <div><div class="text-faint" style="font-size:11px;">External Profit Last Month</div><div class="mono text-good">${money(wh.lastMonthExternalProfit)}</div></div>
          <div><div class="text-faint" style="font-size:11px;">Lifetime Savings + Profit</div><div class="mono">${money(wh.lifetimeInternalSavings + wh.lifetimeExternalProfit)}</div></div>
        </div>
        <p class="text-faint" style="font-size:11px;margin-top:8px;">Your group's own restocking gets first call on capacity at a discount; anything left over sells outside for profit. More throughput means more of both.</p>
        <div class="btn-row">
          <button class="btn btn-sm" data-action="overview:investWarehouseCapacity" ${maxed || d.ledger.cash < upgradeCost ? "disabled" : ""}>${maxed ? "Max Capacity Reached" : `Add ${(500).toLocaleString()} Units/mo (${money(upgradeCost)}, from ${escapeHtml(d.name)})`}</button>
          <button class="btn btn-sm btn-primary" data-action="overview:sweepPartsWarehouse" ${wh.cash <= 0 ? "disabled" : ""}>Sweep ${money(wh.cash)} To Treasury</button>
        </div>
      </div>`;
    })();

    const manufacturerCard = ctx.state.career.role === "gm" ? "" : (() => {
      const mc = ctx.state.manufacturerCo;
      if (!mc.founded) {
        const netWorth = computeGroupNetWorth(ctx.state);
        if (!manufacturerCoUnlocked(ctx.state)) {
          return `
          <div class="card">
            <h3>Found Your Own Manufacturer</h3>
            <p class="text-faint" style="font-size:11.5px;">The capstone: stop buying someone else's franchise and build your own vehicles instead. Unlocks once your group's net worth reaches ${money(MANUFACTURER_CO_UNLOCK_NET_WORTH)}.</p>
            <div class="meter" style="margin-top:8px;"><div style="width:${Math.min(100, (netWorth / MANUFACTURER_CO_UNLOCK_NET_WORTH) * 100)}%"></div></div>
            <p class="sub" style="margin-top:4px;">${money(netWorth)} / ${money(MANUFACTURER_CO_UNLOCK_NET_WORTH)}</p>
          </div>`;
        }
        const cost = manufacturerCoFoundCost(mfgCategory ?? "mainstream");
        const affordable = mfgFunding === "treasury" ? ctx.state.groupTreasury >= cost : d.ledger.cash >= cost;
        const canFound = affordable && !!mfgCategory && mfgBrandNameDraft.trim().length > 0;
        return `
        <div class="card">
          <h3>Found Your Own Manufacturer</h3>
          <p class="text-faint" style="font-size:11.5px;">Name your brand, pick its personality, and stand up a starter lineup. Every unit you ship to your own dealerships from then on earns you both the manufacturer's margin and the dealer's margin — two profit centers on one car, same as a real OEM enjoys.</p>
          <div class="form-row">
            <label>Brand name</label>
            <input type="text" placeholder="e.g. Meridian Motors" value="${escapeHtml(mfgBrandNameDraft)}" data-action="overview:setMfgBrandName" />
          </div>
          <div class="form-row">
            <label>Brand personality</label>
            <select data-action="overview:setMfgCategory">
              <option value="" ${!mfgCategory ? "selected" : ""}>— Select —</option>
              ${FRANCHISE_CATEGORIES.map((c) => `<option value="${c.key}" ${mfgCategory === c.key ? "selected" : ""}>${escapeHtml(c.label)}</option>`).join("")}
            </select>
          </div>
          <p style="font-size:12.5px;">Founding cost: <strong>${money(cost)}</strong></p>
          <div class="form-row">
            <label>Pay from:</label>
            <select data-action="overview:mfgFundingSource">
              <option value="active" ${mfgFunding === "active" ? "selected" : ""}>${escapeHtml(d.name)}'s cash</option>
              <option value="treasury" ${mfgFunding === "treasury" ? "selected" : ""}>Group Treasury (${money(ctx.state.groupTreasury)})</option>
            </select>
          </div>
          <div class="btn-row">
            <button class="btn btn-primary" data-action="overview:foundManufacturer" ${canFound ? "" : "disabled"}>Found Your Manufacturer</button>
          </div>
        </div>`;
      }

      const newStoreCost = houseBrandNewStoreCost();
      const conversionCost = houseBrandConversionCost();
      const rndCost = rAndDCost(ctx.state);
      const rndMaxed = rAndDMaxed(ctx.state);
      const capCost = manufacturerCapacityCost(ctx.state);
      const capMaxed = manufacturerCapacityMaxed(ctx.state);
      const mktCost = marketingCost(ctx.state);
      const reputationMaxed = mc.reputation >= 100;
      const modelsMaxed = lineupMaxed(ctx.state);
      const monthsIn = monthsSinceFounding(ctx.state);
      const monthsNeeded = newModelUnlockMonths(ctx.state);
      const modelReady = canLaunchNewModel(ctx.state);
      const newModelPrice = newModelCost(ctx.state);

      return `
      <div class="card">
        <h3>${escapeHtml(mc.brandName)} — Manufacturing Co.</h3>
        <div class="grid grid-cols-3">
          <div><div class="text-faint" style="font-size:11px;">Production Capacity</div><div class="mono">${mc.productionCapacity.toLocaleString()} units/mo</div></div>
          <div><div class="text-faint" style="font-size:11px;">Production Cost</div><div class="mono">${pct(mc.productionCostFactor, 0)} of transfer price</div></div>
          <div><div class="text-faint" style="font-size:11px;">Brand Reputation</div><div class="mono">${Math.round(mc.reputation)}/100</div></div>
        </div>
        <div class="grid grid-cols-3" style="margin-top:10px;">
          <div><div class="text-faint" style="font-size:11px;">Units Shipped Last Month</div><div class="mono">${mc.lastMonthUnitsShipped}</div></div>
          <div><div class="text-faint" style="font-size:11px;">Profit Last Month</div><div class="mono text-good">${money(mc.lastMonthProfit)}</div></div>
          <div><div class="text-faint" style="font-size:11px;">Uncollected Cash</div><div class="mono text-good">${money(mc.cash)}</div></div>
        </div>
        <div class="table-wrap" style="margin-top:10px;"><table>
          <thead><tr><th>Model</th><th>Class</th><th class="num">Transfer Price</th><th class="num">MSRP</th></tr></thead>
          <tbody>
            ${mc.models.map((model) => `<tr><td>${escapeHtml(model.name)}</td><td style="text-transform:capitalize;">${model.class}</td><td class="num">${money(model.invoice)}</td><td class="num">${money(model.msrp)}</td></tr>`).join("")}
          </tbody>
        </table></div>
        <p class="text-faint" style="font-size:11px;margin-top:6px;">${mc.models.length}/${MAX_MANUFACTURER_MODELS} model lines live${modelsMaxed ? "" : modelReady ? " — the next one is ready to launch." : ` — the next needs ${monthsNeeded} months of brand history (${monthsIn} so far).`}</p>
        <div class="btn-row" style="margin-top:10px;">
          <button class="btn btn-sm" data-action="overview:investMfgRnD" ${rndMaxed || d.ledger.cash < rndCost ? "disabled" : ""}>${rndMaxed ? "R&D Maxed" : `R&D: Cut Cost (${money(rndCost)})`}</button>
          <button class="btn btn-sm" data-action="overview:investMfgCapacity" ${capMaxed || d.ledger.cash < capCost ? "disabled" : ""}>${capMaxed ? "Capacity Maxed" : `More Capacity (${money(capCost)})`}</button>
          <button class="btn btn-sm" data-action="overview:investMfgMarketing" ${reputationMaxed || d.ledger.cash < mktCost ? "disabled" : ""}>${reputationMaxed ? "Reputation Maxed" : `Marketing Push (${money(mktCost)})`}</button>
          <button class="btn btn-sm" data-action="overview:launchNewModel" ${modelsMaxed || !modelReady || d.ledger.cash < newModelPrice ? "disabled" : ""}>${modelsMaxed ? "Lineup Complete" : `${nextModelLabel(ctx.state)} (${money(newModelPrice)})`}</button>
          <button class="btn btn-sm btn-primary" data-action="overview:sweepManufacturer" ${mc.cash <= 0 ? "disabled" : ""}>Sweep ${money(mc.cash)} To Treasury</button>
        </div>
        <p class="text-faint" style="font-size:11px;margin-top:8px;">Investments paid from ${escapeHtml(d.name)}'s cash — the current store you're viewing.</p>
      </div>
      <div class="card">
        <h3>Grow The ${escapeHtml(mc.brandName)} Network</h3>
        <div class="btn-row">
          <button class="btn btn-primary" data-action="overview:foundHouseBrandStore" ${d.ledger.cash < newStoreCost ? "disabled" : ""}>Open A New ${escapeHtml(mc.brandName)} Store (${money(newStoreCost)}, from ${escapeHtml(d.name)})</button>
          <button class="btn" data-action="overview:convertToHouseBrand" ${d.isHouseBrand || d.ledger.cash < conversionCost ? "disabled" : ""}>${d.isHouseBrand ? `${escapeHtml(d.name)} Already Sells ${escapeHtml(mc.brandName)}` : `Convert ${escapeHtml(d.name)} To ${escapeHtml(mc.brandName)} (${money(conversionCost)})`}</button>
        </div>
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

    const acquireManufacturerCard = ctx.state.career.role === "gm" ? "" : (() => {
      const am = ctx.state.acquiredManufacturer;
      if (am?.owned) {
        const modeLabel = am.mergedIntoOwnBrand ? `merged into ${escapeHtml(ctx.state.manufacturerCo.brandName)}` : "run as its own independent brand";
        return `
        <div class="card">
          <h3>${escapeHtml(am.brand)} — Acquired Manufacturer</h3>
          <p class="sub">Bought outright on day ${am.acquiredDay} for ${money(am.acquiredCost)} — ${modeLabel}.</p>
          ${am.mergedIntoOwnBrand ? `
            <p class="text-faint" style="font-size:11.5px;">Its real lineup and plant capacity are now part of ${escapeHtml(ctx.state.manufacturerCo.brandName)} — see the Manufacturing Co. card for production stats.</p>
          ` : `
            <div class="grid grid-cols-3">
              <div><div class="text-faint" style="font-size:11px;">Units Shipped Last Month</div><div class="mono">${am.lastMonthUnitsShipped}</div></div>
              <div><div class="text-faint" style="font-size:11px;">Profit Last Month</div><div class="mono text-good">${money(am.lastMonthProfit)}</div></div>
              <div><div class="text-faint" style="font-size:11px;">Uncollected Cash</div><div class="mono text-good">${money(am.cash)}</div></div>
            </div>
            <p class="text-faint" style="font-size:11.5px;margin-top:8px;">Every ${escapeHtml(am.brand)} dealership you run — present and future — is now factory-owned: no termination risk, no compliance grind, a permanent allocation boost, and its own manufacturing margin on every unit shipped, on top of that store's ordinary retail gross.</p>
            <div class="btn-row" style="margin-top:8px;">
              <button class="btn btn-sm btn-primary" data-action="overview:sweepAcquiredManufacturer" ${am.cash <= 0 ? "disabled" : ""}>Sweep ${money(am.cash)} To Treasury</button>
            </div>
          `}
        </div>`;
      }

      const netWorth = computeGroupNetWorth(ctx.state);
      if (!manufacturerAcquisitionUnlocked(ctx.state)) {
        return `
        <div class="card">
          <h3>Acquire a Real Manufacturer</h3>
          <p class="text-faint" style="font-size:11.5px;">The endgame capstone: buy out an entire real automaker's manufacturing operation, not just one of its dealerships. Terrifyingly expensive — unlocks once your group's net worth reaches ${money(MANUFACTURER_ACQUISITION_UNLOCK_NET_WORTH)}.</p>
          <div class="meter" style="margin-top:8px;"><div style="width:${Math.min(100, (netWorth / MANUFACTURER_ACQUISITION_UNLOCK_NET_WORTH) * 100)}%"></div></div>
          <p class="sub" style="margin-top:4px;">${money(netWorth)} / ${money(MANUFACTURER_ACQUISITION_UNLOCK_NET_WORTH)}</p>
        </div>`;
      }

      const targets = manufacturerAcquisitionTargets(ctx.state, ctx.rng);
      const selectedOption = acquireMfgTarget ? getFranchiseOption(acquireMfgTarget) : null;
      const cost = selectedOption ? acquireManufacturerCost(selectedOption.category) : 0;
      const affordable = selectedOption ? (acquireMfgFunding === "treasury" ? ctx.state.groupTreasury >= cost : d.ledger.cash >= cost) : false;
      const canMerge = ctx.state.manufacturerCo.founded;
      return `
      <div class="card">
        <h3>Acquire a Real Manufacturer</h3>
        <p class="text-faint" style="font-size:11.5px;">Buy out an automaker's entire manufacturing operation outright — every dealership you run under that brand becomes factory-owned (no termination risk, a permanent allocation boost, and its own manufacturing margin on every unit), or fold its real lineup straight into your own house brand. Listings roll over monthly.</p>
        ${targets.length === 0 ? '<div class="list-empty">Nothing on the market right now — check back next month.</div>' : `
        <div class="form-row">
          <label>Target</label>
          <select data-action="overview:setAcquireMfgTarget">
            <option value="" ${!acquireMfgTarget ? "selected" : ""}>— Select —</option>
            ${targets.map((key) => {
              const opt = getFranchiseOption(key);
              return `<option value="${key}" ${acquireMfgTarget === key ? "selected" : ""}>${escapeHtml(opt.brand)} (${money(acquireManufacturerCost(opt.category))})</option>`;
            }).join("")}
          </select>
        </div>
        <div class="form-row">
          <label>Outcome</label>
          <select data-action="overview:setAcquireMfgMerge">
            <option value="independent" ${!acquireMfgMerge ? "selected" : ""}>Keep it running as its own brand</option>
            <option value="merge" ${acquireMfgMerge ? "selected" : ""} ${canMerge ? "" : "disabled"}>Merge into ${canMerge ? escapeHtml(ctx.state.manufacturerCo.brandName) : "your own brand (found one first)"}</option>
          </select>
        </div>
        ${selectedOption ? `<p style="font-size:12.5px;">Acquisition cost: <strong>${money(cost)}</strong></p>` : ""}
        <div class="form-row">
          <label>Pay from:</label>
          <select data-action="overview:acquireMfgFundingSource">
            <option value="active" ${acquireMfgFunding === "active" ? "selected" : ""}>${escapeHtml(d.name)}'s cash</option>
            <option value="treasury" ${acquireMfgFunding === "treasury" ? "selected" : ""}>Group Treasury (${money(ctx.state.groupTreasury)})</option>
          </select>
        </div>
        <div class="btn-row">
          <button class="btn btn-primary" data-action="overview:acquireManufacturer" ${selectedOption && affordable && (!acquireMfgMerge || canMerge) ? "" : "disabled"}>Acquire ${selectedOption ? escapeHtml(selectedOption.brand) : "Manufacturer"}</button>
        </div>
        `}
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
          <div class="big-number ${monthToDateNetIncome(d) >= 0 ? "text-good" : "text-bad"}">${money(monthToDateNetIncome(d))}</div>
          <div class="sub">Gross so far: ${money(monthToDateGrossProfit(d))}</div>
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
          <h3>${d.isHouseBrand ? "Factory Allocation" : "Allocation Tier"}</h3>
          ${d.isHouseBrand
            ? `<div class="big-number">${d.manufacturer.allocationCapMonthly}/mo</div><div class="sub">No quota — you can't be terminated by your own brand.</div>`
            : `<div class="big-number" style="text-transform:capitalize;">${d.manufacturer.tier}</div><div class="sub">Quota: ${d.manufacturer.quotaAttainedThisMonth}/${d.manufacturer.quotaUnitsMonthly} units this month</div>`}
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
      ${takeoverCard}
      ${marketCard}
      ${groupCard}
      ${treasuryCard}
      ${captiveLenderCard}
      ${partsWarehouseCard}
      ${manufacturerCard}
      ${expansionCard}
      ${acquireManufacturerCard}
      ${buildRooftopCard}
    `;
  },
  hasAlert(ctx) {
    return !!ctx.state.takeoverThreat;
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
    if (action === "overview:toggleTreasuryAutoPilot") {
      const target = ctx.state.dealerships[ctx.state.activeDealershipId];
      target.autoPilot.treasury = !target.autoPilot.treasury;
      pushToast(ctx.state, target.autoPilot.treasury ? `${target.name} will now auto-sweep surplus cash to the Treasury monthly.` : `${target.name} will no longer auto-sweep.`, "info");
      return true;
    }
    if (action === "overview:charterCaptiveLender") {
      const result = charterCaptiveLender(ctx.state, captiveLenderFunding, ctx.state.activeDealershipId);
      pushToast(ctx.state, result.ok ? "Captive Lender chartered — every deal financed group-wide now builds your own loan portfolio." : (result.reason ?? "Couldn't charter a captive lender."), result.ok ? "good" : "warn");
      return true;
    }
    if (action === "overview:sweepCaptiveLender") {
      const amount = sweepCaptiveLenderCash(ctx.state);
      pushToast(ctx.state, amount > 0 ? `${money(amount)} swept into the Group Treasury.` : "Nothing to sweep.", amount > 0 ? "good" : "warn");
      return true;
    }
    if (action === "overview:charterPartsWarehouse") {
      const result = charterPartsWarehouse(ctx.state, warehouseFunding, ctx.state.activeDealershipId);
      pushToast(ctx.state, result.ok ? "Parts Warehouse chartered — every store now restocks at wholesale." : (result.reason ?? "Couldn't charter a parts warehouse."), result.ok ? "good" : "warn");
      return true;
    }
    if (action === "overview:investWarehouseCapacity") {
      const ok = investInWarehouseCapacity(ctx.state, ctx.state.activeDealershipId);
      pushToast(ctx.state, ok ? "Warehouse capacity expanded." : "Couldn't expand capacity.", ok ? "good" : "warn");
      return true;
    }
    if (action === "overview:sweepPartsWarehouse") {
      const amount = sweepPartsWarehouseCash(ctx.state);
      pushToast(ctx.state, amount > 0 ? `${money(amount)} swept into the Group Treasury.` : "Nothing to sweep.", amount > 0 ? "good" : "warn");
      return true;
    }
    if (action === "overview:foundManufacturer") {
      if (!mfgCategory) return false;
      const result = foundManufacturerCo(ctx.state, mfgFunding, ctx.state.activeDealershipId, mfgBrandNameDraft, mfgCategory, ctx.rng);
      pushToast(ctx.state, result.ok ? `${ctx.state.manufacturerCo.brandName} is founded! Open or convert a store to start selling it.` : (result.reason ?? "Couldn't found a manufacturer."), result.ok ? "good" : "warn");
      if (result.ok) {
        mfgCategory = null;
        mfgBrandNameDraft = "";
      }
      return true;
    }
    if (action === "overview:foundHouseBrandStore") {
      const result = foundHouseBrandDealership(ctx.state, mfgFunding, ctx.state.activeDealershipId, ctx.rng);
      pushToast(ctx.state, result.ok ? "New house-brand store opened!" : (result.reason ?? "Couldn't open that store."), result.ok ? "good" : "warn");
      return true;
    }
    if (action === "overview:convertToHouseBrand") {
      const target = ctx.state.dealerships[ctx.state.activeDealershipId];
      if (!confirm(`Convert ${target.name} to sell ${ctx.state.manufacturerCo.brandName} instead of its current franchise? This can't be undone.`)) return false;
      const result = convertToHouseBrand(ctx.state, ctx.state.activeDealershipId);
      pushToast(ctx.state, result.ok ? `${target.name} now sells ${ctx.state.manufacturerCo.brandName}.` : (result.reason ?? "Couldn't convert that store."), result.ok ? "good" : "warn");
      return true;
    }
    if (action === "overview:investMfgRnD") {
      const ok = investInRnD(ctx.state, ctx.state.activeDealershipId);
      pushToast(ctx.state, ok ? "Production cost reduced." : "Couldn't invest in R&D.", ok ? "good" : "warn");
      return true;
    }
    if (action === "overview:investMfgCapacity") {
      const ok = investInManufacturerCapacity(ctx.state, ctx.state.activeDealershipId);
      pushToast(ctx.state, ok ? "Production capacity expanded." : "Couldn't expand capacity.", ok ? "good" : "warn");
      return true;
    }
    if (action === "overview:investMfgMarketing") {
      const ok = investInMarketing(ctx.state, ctx.state.activeDealershipId);
      pushToast(ctx.state, ok ? "Marketing push complete — brand reputation up." : "Couldn't run that campaign.", ok ? "good" : "warn");
      return true;
    }
    if (action === "overview:launchNewModel") {
      const result = launchNewModel(ctx.state, ctx.state.activeDealershipId, ctx.rng);
      pushToast(ctx.state, result.ok ? "New model line launched!" : (result.reason ?? "Couldn't launch that model."), result.ok ? "good" : "warn");
      return true;
    }
    if (action === "overview:sweepManufacturer") {
      const amount = sweepManufacturerCoCash(ctx.state);
      pushToast(ctx.state, amount > 0 ? `${money(amount)} swept into the Group Treasury.` : "Nothing to sweep.", amount > 0 ? "good" : "warn");
      return true;
    }
    if (action === "overview:acquireManufacturer") {
      if (!acquireMfgTarget) return false;
      const target = getFranchiseOption(acquireMfgTarget).brand;
      if (!confirm(`Acquire ${target}'s entire manufacturing operation for ${money(acquireManufacturerCost(getFranchiseOption(acquireMfgTarget).category))}? This can't be undone.`)) return false;
      const result = acquireManufacturer(ctx.state, acquireMfgFunding, ctx.state.activeDealershipId, acquireMfgTarget, acquireMfgMerge, ctx.rng);
      pushToast(ctx.state, result.ok ? `${target} acquired! ${acquireMfgMerge ? "Its lineup is now part of your own brand." : "Every store you run under it is now factory-owned."}` : (result.reason ?? "Couldn't complete that acquisition."), result.ok ? "good" : "warn");
      if (result.ok) {
        acquireMfgTarget = null;
        acquireMfgMerge = false;
      }
      return true;
    }
    if (action === "overview:sweepAcquiredManufacturer") {
      const amount = sweepAcquiredManufacturerCash(ctx.state);
      pushToast(ctx.state, amount > 0 ? `${money(amount)} swept into the Group Treasury.` : "Nothing to sweep.", amount > 0 ? "good" : "warn");
      return true;
    }
    if (action === "overview:defendTakeover") {
      const threat = ctx.state.takeoverThreat;
      const targetName = threat ? (ctx.state.dealerships[threat.targetDealershipId]?.name ?? "your store") : "your store";
      const result = defendTakeover(ctx.state, takeoverDefendFunding, ctx.state.activeDealershipId);
      pushToast(ctx.state, result.ok ? `You fought off the bid for ${targetName}.` : (result.reason ?? "Couldn't defend against that bid."), result.ok ? "good" : "warn");
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
    if (action === "overview:captiveFundingSource" && target instanceof HTMLSelectElement) {
      captiveLenderFunding = target.value as CaptiveLenderFunding;
      return true;
    }
    if (action === "overview:warehouseFundingSource" && target instanceof HTMLSelectElement) {
      warehouseFunding = target.value as PartsWarehouseFunding;
      return true;
    }
    if (action === "overview:setMfgBrandName" && target instanceof HTMLInputElement) {
      mfgBrandNameDraft = target.value;
      return true;
    }
    if (action === "overview:setMfgCategory" && target instanceof HTMLSelectElement) {
      mfgCategory = (target.value || null) as FranchiseCategory | null;
      return true;
    }
    if (action === "overview:mfgFundingSource" && target instanceof HTMLSelectElement) {
      mfgFunding = target.value as ManufacturerCoFunding;
      return true;
    }
    if (action === "overview:setAcquireMfgTarget" && target instanceof HTMLSelectElement) {
      acquireMfgTarget = (target.value || null) as FranchiseKey | null;
      return true;
    }
    if (action === "overview:setAcquireMfgMerge" && target instanceof HTMLSelectElement) {
      acquireMfgMerge = target.value === "merge";
      return true;
    }
    if (action === "overview:acquireMfgFundingSource" && target instanceof HTMLSelectElement) {
      acquireMfgFunding = target.value as ManufacturerAcquisitionFunding;
      return true;
    }
    if (action === "overview:takeoverFundingSource" && target instanceof HTMLSelectElement) {
      takeoverDefendFunding = target.value as TakeoverDefenseFunding;
      return true;
    }
    if (action === "overview:setTreasuryAmount" && target instanceof HTMLInputElement) {
      treasuryAmountDraft = Math.max(0, Number(target.value) || 0);
      return true;
    }
    if (action === "overview:setSweepThreshold" && target instanceof HTMLInputElement) {
      const active = ctx.state.dealerships[ctx.state.activeDealershipId];
      active.autoSweepThreshold = Math.max(0, Number(target.value) || 0);
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
