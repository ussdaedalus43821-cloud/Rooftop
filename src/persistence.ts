import type { GameState } from "./types.js";

const SAVE_KEY = "rooftop.save.v1";

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
