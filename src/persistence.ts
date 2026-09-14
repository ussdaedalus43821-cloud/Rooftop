import type { GameState } from "./types.js";
import { newCaptiveLender } from "./engine/captiveLender.js";
import { newPartsWarehouse } from "./engine/partsWarehouse.js";
import { newManufacturerCo } from "./engine/manufacturerCo.js";

const SAVE_KEY = "rooftop.save.v1";
const MAX_SERVICE_QUEUE = 150;

export interface SaveResult {
  ok: boolean;
  error?: string;
}

export function saveGame(state: GameState): SaveResult {
  try {
    const json = JSON.stringify(state);
    localStorage.setItem(SAVE_KEY, json);
    return { ok: true };
  } catch (err) {
    console.error("Rooftop: failed to save game", err);
    const quotaExceeded = err instanceof DOMException && (err.name === "QuotaExceededError" || err.name === "NS_ERROR_DOM_QUOTA_REACHED");
    return {
      ok: false,
      error: quotaExceeded
        ? "Browser storage is full. Download a save backup from Settings so you don't lose progress."
        : "Couldn't save to this browser (storage may be disabled, e.g. Private Browsing).",
    };
  }
}

/** Brings an older save up to the current shape. Shared by loadGame (localStorage) and importSaveFromFile (a JSON file the player picked), so a downloaded backup restores exactly like an autosave would. */
function migrateState(state: GameState): GameState {
  for (const d of Object.values(state.dealerships)) {
    if (d.isHouseBrand === undefined) d.isHouseBrand = false;
    if (!d.autoPilot) d.autoPilot = { sales: false, fi: false, auction: false, allocation: false, treasury: false };
    if (d.autoPilot.auction === undefined) d.autoPilot.auction = false;
    if (d.autoPilot.allocation === undefined) d.autoPilot.allocation = false;
    if (d.autoPilot.treasury === undefined) d.autoPilot.treasury = false;
    if (d.autoSweepThreshold === undefined) d.autoSweepThreshold = 100_000;
    if (d.auctionAutoBidDiscountPct === undefined) d.auctionAutoBidDiscountPct = 10;
    if (!d.auctionLots) d.auctionLots = [];
    if (d.auctionLotsDay === undefined) d.auctionLotsDay = -1;
    if (!d.modelStats) d.modelStats = {};
    if (d.currentMonth.incentiveExpense === undefined) d.currentMonth.incentiveExpense = 0;
    for (const m of d.monthlyHistory) {
      if (m.incentiveExpense === undefined) m.incentiveExpense = 0;
    }
    for (const s of d.staff) {
      if (s.incentivesThisMonth === undefined) s.incentivesThisMonth = 0;
    }
    // One-time cleanup for saves from before the service queue was capped:
    // an unbounded backlog (retained customer base scaling demand forever
    // against a fixed bay count) could grow into the thousands. Keep the
    // most-progressed jobs — least sunk cost is what a customer would have
    // taken elsewhere anyway — and drop the rest.
    if (d.service.jobs.length > MAX_SERVICE_QUEUE) {
      const dropped = d.service.jobs.length - MAX_SERVICE_QUEUE;
      d.service.jobs = [...d.service.jobs]
        .sort((a, b) => b.hoursCompleted - a.hoursCompleted)
        .slice(0, MAX_SERVICE_QUEUE);
      state.toasts.push({
        id: `migrate_${d.id}_queue`,
        text: `${d.name}: trimmed ${dropped.toLocaleString()} jobs from an overgrown service backlog — bays are now capacity-capped so this won't happen again.`,
        kind: "warn",
        day: state.day,
      });
    }
  }
  if (!state.acquisitionTargets) state.acquisitionTargets = [];
  if (state.acquisitionTargetsMonth === undefined) state.acquisitionTargetsMonth = -1;
  if (state.groupTreasury === undefined) state.groupTreasury = 0;
  if (!state.captiveLender) state.captiveLender = newCaptiveLender();
  if (!state.partsWarehouse) state.partsWarehouse = newPartsWarehouse();
  if (!state.manufacturerCo) state.manufacturerCo = newManufacturerCo();
  return state;
}

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return migrateState(JSON.parse(raw) as GameState);
  } catch (err) {
    console.error("Rooftop: failed to load game", err);
    return null;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (err) {
    console.error("Rooftop: failed to clear save", err);
  }
}

export function hasSave(): boolean {
  try {
    return localStorage.getItem(SAVE_KEY) !== null;
  } catch {
    return false;
  }
}

/** Downloads the current game as a JSON file — a real file on the player's device, independent of browser storage (which Safari/iOS can evict without warning). */
export function exportSaveToFile(state: GameState): void {
  const json = JSON.stringify(state, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0, 10);
  const a = document.createElement("a");
  a.href = url;
  a.download = `rooftop-save-day${state.day}-${date}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Reads a player-picked JSON file back into a playable GameState, migrated the same way an autosave load would be. */
export function importSaveFromFile(file: File): Promise<GameState> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as GameState;
        if (!parsed || typeof parsed !== "object" || !parsed.dealerships) {
          reject(new Error("That file doesn't look like a Rooftop save."));
          return;
        }
        resolve(migrateState(parsed));
      } catch {
        reject(new Error("That file doesn't look like a Rooftop save."));
      }
    };
    reader.readAsText(file);
  });
}
