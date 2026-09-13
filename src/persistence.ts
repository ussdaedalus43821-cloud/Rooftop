import type { GameState } from "./types.js";

const SAVE_KEY = "rooftop.save.v1";
const MAX_SERVICE_QUEUE = 150;

export function saveGame(state: GameState): void {
  try {
    const json = JSON.stringify(state);
    localStorage.setItem(SAVE_KEY, json);
  } catch (err) {
    console.error("Rooftop: failed to save game", err);
  }
}

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw) as GameState;
    for (const d of Object.values(state.dealerships)) {
      if (!d.autoPilot) d.autoPilot = { sales: false, fi: false, auction: false, allocation: false };
      if (d.autoPilot.auction === undefined) d.autoPilot.auction = false;
      if (d.autoPilot.allocation === undefined) d.autoPilot.allocation = false;
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
    return state;
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
