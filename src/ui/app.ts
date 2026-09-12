import type { ClockSpeed, FranchiseKey, GameState } from "../types.js";
import type { AppCtx, TabModule } from "./types.js";
import { Rng } from "../rng.js";
import { formatDate } from "../engine/clock.js";
import { totalAssets, totalLiabilities } from "../engine/financials.js";
import { money } from "./format.js";
import { resolveMilestone } from "../engine/career.js";
import { createNewGame } from "../state.js";
import { clearSave, saveGame } from "../persistence.js";
import { FRANCHISE_OPTIONS } from "../constants.js";

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
  return `
  <div class="setup-screen">
    <div class="setup-box">
      <div class="setup-logo">ROOFTOP</div>
      <h1>Pick Your Franchise</h1>
      <p class="setup-sub">Every deal, invoice, and MSRP in this store is real. Choose the lineup you'll be selling.</p>
      <div class="franchise-grid">
        ${FRANCHISE_OPTIONS.map((f) => `
          <button class="franchise-card" data-action="newgame:pick" data-franchise="${f.key}">
            <div class="franchise-name">${escapeHtml(f.brand)}</div>
            <div class="franchise-tagline">${escapeHtml(f.tagline)}</div>
            <div class="franchise-desc">${escapeHtml(f.description)}</div>
            <div class="franchise-stats">Starting cash ${money(f.startingCash)} · Allocation cap ${f.baseQuota}/mo</div>
          </button>
        `).join("")}
      </div>
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
