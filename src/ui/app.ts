import type { ClockSpeed, FranchiseCategory, FranchiseKey, GameState } from "../types.js";
import type { AppCtx, TabModule } from "./types.js";
import { Rng } from "../rng.js";
import { formatDate } from "../engine/clock.js";
import { totalAssets, totalLiabilities } from "../engine/financials.js";
import { pushToast, monthToDateNetIncome } from "../engine/engine.js";
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
import { employeeTab } from "./employeeTab.js";
import { manufacturerTab } from "./manufacturerTab.js";
import { insuranceTab } from "./insuranceTab.js";
import { financialsTab } from "./financialsTab.js";
import { settingsTab } from "./settingsTab.js";

const TABS: TabModule[] = [
  overviewTab,
  inventoryTab,
  salesFloorTab,
  fiTab,
  serviceTab,
  employeeTab,
  manufacturerTab,
  insuranceTab,
  financialsTab,
  settingsTab,
];

let rootEl: HTMLElement | null = null;
let ctx: AppCtx | null = null;
let newGameSetupActive = false;
let pickerCategory: FranchiseCategory | null = null;
let pickerBrand: FranchiseKey | null = null;
let notificationsPanelOpen = false;
let newRooftopNameDraft = "";

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

  // Buttons, not a <select>: the game loop re-renders (replacing this whole
  // element) many times a second at higher speeds, which blows away an open
  // native dropdown before a click on it can land. A button's click fires
  // and resolves in one synchronous step, so it survives that churn.
  const dealershipSwitcher = Object.keys(state.dealerships).length > 1
    ? `<div class="dealership-switcher">
        ${Object.values(state.dealerships).map((x) => `<button class="btn btn-sm ${x.id === state.activeDealershipId ? "btn-primary" : ""}" data-action="global:switchDealership" data-dealership="${x.id}">${escapeHtml(x.name)}</button>`).join("")}
      </div>`
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

  const milestoneHtml = renderMilestoneModal();
  const eventModalHtml = renderEventModal();
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
        <div class="hud-stat"><div class="label">MTD Net</div><div class="value ${monthToDateNetIncome(d) >= 0 ? "pos" : "neg"}">${money(monthToDateNetIncome(d))}</div></div>
        <div class="hud-stat"><div class="label">CSI</div><div class="value">${Math.round(d.manufacturer.csi)}</div></div>
      </div>
      ${renderNotificationBell(state)}
    </div>
    <div class="tabbar">${tabsHtml}</div>
    <div class="tab-content">${activeTabModule().render(ctx!)}</div>
    ${notificationsPanelOpen ? renderNotificationPanel(state) : ""}
    ${milestoneHtml}
    ${eventModalHtml}
    ${gameOverHtml}
  `;
}

function renderNotificationBell(state: GameState): string {
  const count = state.toasts.length;
  return `
    <button class="bell-btn" data-action="notifications:toggle" aria-label="Notifications">
      🔔${count > 0 ? `<span class="bell-badge">${count > 99 ? "99+" : count}</span>` : ""}
    </button>`;
}

function renderNotificationPanel(state: GameState): string {
  const items = [...state.toasts].reverse();
  return `
  <div class="notif-panel">
    <div class="notif-panel-header">
      <h3>Notifications</h3>
      <div class="btn-row" style="margin-top:0;">
        <button class="btn btn-sm" data-action="notifications:clearAll" ${items.length === 0 ? "disabled" : ""}>Clear All</button>
        <button class="btn btn-sm" data-action="notifications:toggle">Close</button>
      </div>
    </div>
    <div class="notif-list">
      ${items.length === 0 ? '<div class="list-empty">Nothing yet.</div>' : items.map((t) => `
        <div class="notif-item ${t.kind}">
          <span class="notif-text">${escapeHtml(t.text)}</span>
          <span class="notif-day">Day ${t.day}</span>
          <button class="notif-remove" data-action="notifications:remove" data-id="${t.id}" aria-label="Remove">&times;</button>
        </div>`).join("")}
    </div>
  </div>`;
}

function roleLabel(state: GameState): string {
  if (state.career.role === "gm") return "General Manager";
  if (state.career.role === "partial_owner") return `Partial Owner (${Math.round(state.career.equityPct * 100)}%)`;
  return "Owner-Operator";
}

function renderMilestoneModal(): string {
  if (!ctx || !ctx.state.career.milestoneOfferPending) return "";
  const c = ctx.state.career;

  // Already a partial owner: every offer after the first one is a
  // repeatable "buy more" ask, not the original three-way fork.
  if (c.role === "partial_owner") {
    const d = c.equityDealershipId ? ctx.state.dealerships[c.equityDealershipId] : undefined;
    if (!d) return "";
    return `
    <div class="modal-backdrop">
      <div class="modal">
        <h2>Another Opportunity</h2>
        <p>Sustained strong performance over ${c.consecutiveStrongMonths}+ months at ${escapeHtml(d.name)} has the majority owner willing to sell you more. You currently hold <strong>${Math.round(c.equityPct * 100)}%</strong> and have accrued <strong>${money(c.bonusPoolAccrued)}</strong> toward buying in further. Keep climbing toward full ownership?</p>
        <div class="btn-row">
          <button class="btn btn-primary" data-action="milestone:choose" data-choice="equity">Buy more equity</button>
          <button class="btn" data-action="milestone:choose" data-choice="decline">Not yet</button>
        </div>
      </div>
    </div>`;
  }

  const d = ctx.state.dealerships[ctx.state.activeDealershipId];
  const brand = getFranchiseOption(d.manufacturer.franchiseKey).brand;
  return `
  <div class="modal-backdrop">
    <div class="modal">
      <h2>A Real Opportunity</h2>
      <p>Sustained strong performance over ${c.consecutiveStrongMonths}+ months has gotten the owner's attention. You've accrued <strong>${money(c.bonusPoolAccrued)}</strong> in bonus/profit-share. What do you want to do?</p>
      <div class="btn-row">
        <button class="btn btn-primary" data-action="milestone:choose" data-choice="equity">Buy an equity stake in this store</button>
        <button class="btn btn-good" data-action="milestone:choose" data-choice="new_rooftop">Quit and found your own rooftop</button>
        <button class="btn" data-action="milestone:choose" data-choice="decline">Not yet</button>
      </div>
      <p class="text-faint" style="font-size:12px;margin-top:8px;">Founding your own rooftop means walking away for good — you never held equity here, so this store isn't yours to bring with you. It stays behind, and your bonus pool becomes the seed capital for a brand-new store you own outright — under whatever name you give it, not this one's. Buying equity instead keeps you here, with room to buy more later as you keep performing, and a monthly cut of the profit paid out on whatever share you hold.</p>
      <div style="margin-top:8px;">
        <label class="text-faint" style="font-size:12px;display:block;margin-bottom:4px;">Name your new rooftop (only used if you found one):</label>
        <input type="text" placeholder="e.g. ${escapeHtml(brand)} of Meridian" value="${escapeHtml(newRooftopNameDraft)}" data-action="milestone:setName" style="width:100%;" maxlength="60" />
      </div>
    </div>
  </div>`;
}

const EVENT_KIND_TITLE: Partial<Record<string, string>> = {
  test_drive_collision: "Test-Drive Collision",
  hailstorm: "Hailstorm",
  lot_theft: "Lot Theft",
  service_bay_mishap: "Service Bay Mishap",
  slip_and_fall: "Slip-and-Fall Claim",
  manufacturer_recall: "Manufacturer Recall",
  compliance_fine: "Compliance Fine",
};

function renderEventModal(): string {
  if (!ctx || ctx.state.pendingEventModal.length === 0) return "";
  const event = ctx.state.pendingEventModal[0];
  const remaining = ctx.state.pendingEventModal.length - 1;
  const title = EVENT_KIND_TITLE[event.kind] ?? "Incident";
  const netImpact = event.lossAmount - event.insurancePayout;
  return `
  <div class="modal-backdrop">
    <div class="modal">
      <h2>${escapeHtml(title)} — ${escapeHtml(event.dealershipName)}</h2>
      <p>${escapeHtml(event.detail)}</p>
      ${event.lossAmount > 0 ? `
      <div class="grid grid-cols-3" style="margin-top:4px;">
        <div><div class="text-faint" style="font-size:11px;">Loss</div><div class="mono text-bad">${money(event.lossAmount)}</div></div>
        <div><div class="text-faint" style="font-size:11px;">Insurance Paid</div><div class="mono ${event.insurancePayout > 0 ? "text-good" : ""}">${event.insurancePayout > 0 ? money(event.insurancePayout) : "—"}</div></div>
        <div><div class="text-faint" style="font-size:11px;">Net Impact</div><div class="mono text-bad">${money(netImpact)}</div></div>
      </div>` : ""}
      <div class="btn-row" style="margin-top:14px;">
        <button class="btn btn-primary" data-action="event:acknowledge">Got it${remaining > 0 ? ` (${remaining} more)` : ""}</button>
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
  if (action === "global:switchDealership") {
    const id = target.getAttribute("data-dealership");
    if (id && ctx.state.dealerships[id]) ctx.state.activeDealershipId = id;
    render();
    return;
  }
  if (action === "milestone:choose") {
    const choice = target.getAttribute("data-choice") as "equity" | "new_rooftop" | "decline";
    resolveMilestone(ctx.state, choice, ctx.state.day, ctx.rng, newRooftopNameDraft.trim() || undefined);
    newRooftopNameDraft = "";
    if (choice === "equity") {
      const pct = Math.round(ctx.state.career.equityPct * 100);
      pushToast(ctx.state, ctx.state.career.role === "owner_operator"
        ? "Bought out the rest of your stake — you own the place outright now."
        : `Bought in for ${pct}% total — a cut of profit gets paid out to you each strong month.`, "good");
    } else if (choice === "new_rooftop") {
      pushToast(ctx.state, "Founded your own rooftop — you own it outright.", "good");
    }
    ctx.markDirty();
    render();
    return;
  }
  if (action === "event:acknowledge") {
    ctx.state.pendingEventModal.shift();
    render();
    return;
  }
  if (action === "notifications:toggle") {
    notificationsPanelOpen = !notificationsPanelOpen;
    render();
    return;
  }
  if (action === "notifications:remove") {
    const id = target.getAttribute("data-id");
    ctx.state.toasts = ctx.state.toasts.filter((t) => t.id !== id);
    ctx.markDirty();
    render();
    return;
  }
  if (action === "notifications:clearAll") {
    ctx.state.toasts = [];
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
  if (action === "milestone:setName" && target instanceof HTMLInputElement) {
    newRooftopNameDraft = target.value;
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
