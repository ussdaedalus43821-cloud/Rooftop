import type { ClockSpeed, FranchiseCategory, FranchiseKey, GameState } from "../types.js";
import type { AppCtx, TabModule } from "./types.js";
import { Rng } from "../rng.js";
import { formatDate } from "../engine/clock.js";
import { totalAssets, totalLiabilities } from "../engine/financials.js";
import { money } from "./format.js";
import { resolveMilestone } from "../engine/career.js";
import { createNewGame } from "../state.js";
import { clearSave, saveGame } from "../persistence.js";
import { FRANCHISE_CATEGORIES, franchisesInCategory, getFranchiseOption } from "../constants.js";

import { overviewTab } from "./overview.js";
import { inventoryTab } from "./inventoryTab.js";
import { salesFloorTab } from "./salesFloorTab.js";
import { fiTab } from "./fiTab.js";
import { serviceTab } from "./serviceTab.js";
import { manufacturerTab } from "./manufacturerTab.js";
import { financialsTab } from "./financialsTab.js";
import { settingsTab } from "./settingsTab.js";

const TABS: TabModule[] = [
  overviewTab,
  inventoryTab,
  salesFloorTab,
  fiTab,
  serviceTab,
  manufacturerTab,
  financialsTab,
  settingsTab,
];

let rootEl: HTMLElement | null = null;
let ctx: AppCtx | null = null;
let newGameSetupActive = false;
let pickerCategory: FranchiseCategory | null = null;
let pickerBrand: FranchiseKey | null = null;

export function isNewGameSetupActive(): boolean {
  return newGameSetupActive;
}

export function mountApp(root: HTMLElement, state: GameState, rng: Rng, markDirty: () => void, forceSetup = false): void {
  rootEl = root;
  ctx = {
    state,
    rng,
    rerender: () => render(),
    markDirty,
  };
  if (forceSetup) newGameSetupActive = true;
  root.addEventListener("click", onClick);
  root.addEventListener("change", onInput);
  render();
}

function activeTabModule(): TabModule {
  const found = TABS.find((t) => t.key === ctx!.state.activeTab);
  return found ?? TABS[0];
}

function renderFranchisePicker(): string {
  const brandChoices = pickerCategory ? franchisesInCategory(pickerCategory) : [];
  const selectedBrand = pickerBrand ? getFranchiseOption(pickerBrand) : null;

  return `
  <div class="setup-screen">
    <div class="setup-box setup-box-narrow">
      <div class="setup-logo">ROOFTOP</div>
      <h1>Set Up Your Store</h1>
      <p class="setup-sub">Every brand, model, invoice, and MSRP here is real. Two questions and you're on the lot.</p>

      <div class="form-row">
        <label>What kind of customer base are you looking to serve?</label>
        <select data-action="newgame:setCategory">
          <option value="" ${!pickerCategory ? "selected" : ""}>— Select a customer base —</option>
          ${FRANCHISE_CATEGORIES.map((c) => `<option value="${c.key}" ${pickerCategory === c.key ? "selected" : ""}>${escapeHtml(c.label)}</option>`).join("")}
        </select>
        ${pickerCategory ? `<div class="setup-hint">${escapeHtml(FRANCHISE_CATEGORIES.find((c) => c.key === pickerCategory)!.description)}</div>` : ""}
      </div>

      ${pickerCategory ? `
      <div class="form-row">
        <label>Which brand?</label>
        <select data-action="newgame:setBrand">
          <option value="" ${!pickerBrand ? "selected" : ""}>— Select a brand —</option>
          ${brandChoices.map((f) => `<option value="${f.key}" ${pickerBrand === f.key ? "selected" : ""}>${escapeHtml(f.brand)}</option>`).join("")}
        </select>
      </div>` : ""}

      ${selectedBrand ? `
      <div class="franchise-card franchise-card-static">
        <div class="franchise-name">${escapeHtml(selectedBrand.brand)}</div>
        <div class="franchise-tagline">${escapeHtml(selectedBrand.tagline)}</div>
        <div class="franchise-desc">${escapeHtml(selectedBrand.description)}</div>
        <div class="franchise-stats">Starting cash ${money(selectedBrand.startingCash)} · Allocation cap ${selectedBrand.baseQuota}/mo</div>
      </div>
      <div class="btn-row" style="justify-content:center;">
        <button class="btn btn-primary" data-action="newgame:pick" data-franchise="${selectedBrand.key}">Start This Dealership</button>
      </div>` : ""}
    </div>
  </div>`;
}

export function render(): void {
  if (!rootEl || !ctx) return;
  if (newGameSetupActive) {
    rootEl.innerHTML = renderFranchisePicker();
    return;
  }
  const state = ctx.state;
  const d = state.dealerships[state.activeDealershipId];
  const inv = totalAssets(d) - totalLiabilities(d);

  const dealershipSwitcher = Object.keys(state.dealerships).length > 1
    ? `<select data-action="global:switchDealership" class="btn btn-sm" style="margin-left:8px;">
        ${Object.values(state.dealerships).map((x) => `<option value="${x.id}" ${x.id === state.activeDealershipId ? "selected" : ""}>${escapeHtml(x.name)}</option>`).join("")}
      </select>`
    : "";

  const tabsHtml = TABS.map((t) => {
    const alert = t.hasAlert && t.hasAlert(ctx!) ? `<span class="flag"></span>` : "";
    return `<button class="tab-btn ${t.key === state.activeTab ? "active" : ""}" data-action="global:setTab" data-tab="${t.key}">${t.label}${alert}</button>`;
  }).join("");

  const speeds: { v: ClockSpeed; label: string }[] = [
    { v: 0, label: "II" },
    { v: 1, label: "1x" },
    { v: 4, label: "4x" },
    { v: 15, label: "15x" },
  ];
  const speedHtml = speeds.map((s) => `<button class="speed-btn ${state.speed === s.v ? "active" : ""}" data-action="global:setSpeed" data-speed="${s.v}">${s.label}</button>`).join("");

  const toastsHtml = state.toasts.slice(-5).map((t) => `<div class="toast ${t.kind}">${escapeHtml(t.text)}</div>`).join("");

  const milestoneHtml = renderMilestoneModal();
  const gameOverHtml = renderGameOver();

  rootEl.innerHTML = `
    <div class="topbar">
      <div class="brand">
        <span class="logo">ROOFTOP</span>
        <span class="store-name">${escapeHtml(d.name)} · ${escapeHtml(d.brand)}${d.isUsedOnly ? ' <span class="badge badge-bad">USED ONLY</span>' : ""}</span>
        ${dealershipSwitcher}
      </div>
      <div class="clock-cluster">
        <div class="date-display">${formatDate(state.day)}<span class="phase">Day ${state.day} · ${roleLabel(state)}</span></div>
        <div class="speed-controls">${speedHtml}</div>
      </div>
      <div class="hud-stats">
        <div class="hud-stat"><div class="label">Cash</div><div class="value ${d.ledger.cash < 0 ? "neg" : ""}">${money(d.ledger.cash)}</div></div>
        <div class="hud-stat"><div class="label">Net Worth</div><div class="value ${inv < 0 ? "neg" : "pos"}">${money(inv)}</div></div>
        <div class="hud-stat"><div class="label">MTD Net</div><div class="value ${d.currentMonth.netIncome >= 0 ? "pos" : "neg"}">${money(d.currentMonth.netIncome)}</div></div>
        <div class="hud-stat"><div class="label">CSI</div><div class="value">${Math.round(d.manufacturer.csi)}</div></div>
      </div>
    </div>
    <div class="tabbar">${tabsHtml}</div>
    <div class="tab-content">${activeTabModule().render(ctx!)}</div>
    <div class="toast-stack">${toastsHtml}</div>
    ${milestoneHtml}
    ${gameOverHtml}
  `;
}

function roleLabel(state: GameState): string {
  if (state.career.role === "gm") return "General Manager";
  if (state.career.role === "partial_owner") return `Partial Owner (${Math.round(state.career.equityPct * 100)}%)`;
  return "Owner-Operator";
}

function renderMilestoneModal(): string {
  if (!ctx || !ctx.state.career.milestoneOfferPending) return "";
  const c = ctx.state.career;
  return `
  <div class="modal-backdrop">
    <div class="modal">
      <h2>A Real Opportunity</h2>
      <p>Sustained strong performance over ${c.consecutiveStrongMonths}+ months has gotten the owner's attention. You've accrued <strong>${money(c.bonusPoolAccrued)}</strong> in bonus/profit-share. What do you want to do?</p>
      <div class="btn-row">
        <button class="btn btn-primary" data-action="milestone:choose" data-choice="equity">Buy an equity stake in this store</button>
        <button class="btn btn-good" data-action="milestone:choose" data-choice="new_rooftop">Take ownership of a new rooftop</button>
        <button class="btn" data-action="milestone:choose" data-choice="decline">Not yet</button>
      </div>
    </div>
  </div>`;
}

function renderGameOver(): string {
  if (!ctx || !ctx.state.gameOver) return "";
  const go = ctx.state.gameOver;
  return `
  <div class="gameover-screen">
    <div class="gameover-box">
      <h1>${go.kind === "floorplan_seized" ? "Floor-Plan Line Pulled" : "Game Over"}</h1>
      <p>${escapeHtml(go.message)}</p>
      <div class="btn-row" style="justify-content:center;">
        <button class="btn btn-primary" data-action="global:newGame">Start a New Store</button>
      </div>
    </div>
  </div>`;
}

function onClick(e: MouseEvent): void {
  const target = (e.target as HTMLElement).closest("[data-action]") as HTMLElement | null;
  if (!target || !ctx) return;
  const action = target.getAttribute("data-action")!;

  if (action === "global:setTab") {
    ctx.state.activeTab = target.getAttribute("data-tab")!;
    render();
    return;
  }
  if (action === "global:setSpeed") {
    ctx.state.speed = Number(target.getAttribute("data-speed")) as ClockSpeed;
    render();
    return;
  }
  if (action === "milestone:choose") {
    const choice = target.getAttribute("data-choice") as "equity" | "new_rooftop" | "decline";
    resolveMilestone(ctx.state, choice, ctx.state.day, ctx.rng);
    ctx.markDirty();
    render();
    return;
  }
  if (action === "global:newGame") {
    if (!confirm("Start a brand-new store? This discards the current game.")) return;
    newGameSetupActive = true;
    render();
    return;
  }
  if (action === "newgame:pick") {
    const key = target.getAttribute("data-franchise") as FranchiseKey;
    clearSave();
    const fresh = createNewGame(Date.now(), key);
    Object.assign(ctx.state, fresh);
    newGameSetupActive = false;
    pickerCategory = null;
    pickerBrand = null;
    saveGame(ctx.state);
    render();
    return;
  }

  const mod = activeTabModule();
  if (mod.onAction && mod.onAction(ctx, action, target)) {
    ctx.markDirty();
    render();
  }
}

function onInput(e: Event): void {
  const target = (e.target as HTMLElement).closest("[data-action]") as HTMLElement | null;
  if (!target || !ctx) return;
  const action = target.getAttribute("data-action")!;
  if (action === "newgame:setCategory" && target instanceof HTMLSelectElement) {
    pickerCategory = (target.value || null) as FranchiseCategory | null;
    pickerBrand = null;
    render();
    return;
  }
  if (action === "newgame:setBrand" && target instanceof HTMLSelectElement) {
    pickerBrand = (target.value || null) as FranchiseKey | null;
    render();
    return;
  }
  if (action === "global:switchDealership" && target instanceof HTMLSelectElement) {
    ctx.state.activeDealershipId = target.value;
    render();
    return;
  }
  const mod = activeTabModule();
  if (mod.onInput && mod.onInput(ctx, action, target)) {
    render();
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
