import type { GameState } from "./types.js";
import { newCaptiveLender } from "./engine/captiveLender.js";
import { newPartsWarehouse } from "./engine/partsWarehouse.js";
import { newManufacturerCo } from "./engine/manufacturerCo.js";
import { newEconomyState } from "./engine/economy.js";
import { newInsuranceState } from "./engine/insurance.js";
import { getFranchiseOption } from "./constants.js";

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
    if (d.factoryOwned === undefined) d.factoryOwned = false;
    if (!d.autoPilot) d.autoPilot = { sales: false, fi: false, auction: false, allocation: false, treasury: false };
    if (d.autoPilot.auction === undefined) d.autoPilot.auction = false;
    if (d.autoPilot.allocation === undefined) d.autoPilot.allocation = false;
    if (d.autoPilot.treasury === undefined) d.autoPilot.treasury = false;
    if (d.autoSweepThreshold === undefined) d.autoSweepThreshold = 100_000;
    if (d.auctionAutoBidDiscountPct === undefined) d.auctionAutoBidDiscountPct = 10;
    if (!d.auctionLots) d.auctionLots = [];
    if (d.auctionLotsDay === undefined) d.auctionLotsDay = -1;
    if (!d.modelStats) d.modelStats = {};
    if (!d.fiChargebackExposure) d.fiChargebackExposure = [];
    if (d.currentMonth.incentiveExpense === undefined) d.currentMonth.incentiveExpense = 0;
    if (d.currentMonth.occupancyExpense === undefined) d.currentMonth.occupancyExpense = 0;
    if (d.currentMonth.propertyTaxExpense === undefined) d.currentMonth.propertyTaxExpense = 0;
    if (d.currentMonth.utilitiesExpense === undefined) d.currentMonth.utilitiesExpense = 0;
    if (d.currentMonth.incomeTaxExpense === undefined) d.currentMonth.incomeTaxExpense = 0;
    if (d.currentMonth.holdbackIncome === undefined) d.currentMonth.holdbackIncome = 0;
    if (d.currentMonth.chargebackExpense === undefined) d.currentMonth.chargebackExpense = 0;
    if (d.currentMonth.insurancePremiumExpense === undefined) d.currentMonth.insurancePremiumExpense = 0;
    if (!d.insurance) d.insurance = newInsuranceState();
    for (const deal of d.deals) {
      if (!deal.vehicleLabel) {
        const v = d.vehicles.find((x) => x.id === deal.vehicleId);
        deal.vehicleLabel = v ? `${v.model.name} ${v.model.trim}` : "vehicle";
      }
    }
    for (const m of d.monthlyHistory) {
      if (m.incentiveExpense === undefined) m.incentiveExpense = 0;
      if (m.occupancyExpense === undefined) m.occupancyExpense = 0;
      if (m.propertyTaxExpense === undefined) m.propertyTaxExpense = 0;
      if (m.utilitiesExpense === undefined) m.utilitiesExpense = 0;
      if (m.incomeTaxExpense === undefined) m.incomeTaxExpense = 0;
      if (m.holdbackIncome === undefined) m.holdbackIncome = 0;
      if (m.chargebackExpense === undefined) m.chargebackExpense = 0;
      if (m.insurancePremiumExpense === undefined) m.insurancePremiumExpense = 0;
    }
    for (const s of d.staff) {
      if (s.incentivesThisMonth === undefined) s.incentivesThisMonth = 0;
      if (s.meritStreak === undefined) s.meritStreak = 0;
      if (s.raisesReceived === undefined) s.raisesReceived = 0;
    }
    // Corrects a bug where "Owner Contributed" and "Retained Earnings" could
    // drift by equal, opposite amounts every time cash round-tripped through
    // the pooled Group Treasury (a sweep out, later reversed by a rescue or
    // manual deposit back in) — see reverseDistribution in financials.ts.
    // Total equity was always correct (and still is here — this preserves
    // it exactly); only the split between the two lines was getting
    // corrupted, sometimes by tens of millions after years of autopilot.
    // Every dealership's TRUE founding contribution is a fixed, still-known
    // per-franchise constant, so the correct split is fully recoverable:
    // reset Owner Contributed to that constant and let Retained Earnings
    // absorb whatever's left of the (unchanged) total. Safe to reapply on
    // every load — once corrected, this is a no-op forever after, since
    // nothing writes to Owner Contributed except at a store's founding.
    const trueContributed = getFranchiseOption(d.manufacturer.franchiseKey).startingOwnerEquity;
    if (Math.abs(d.ledger.ownerEquityContributed - trueContributed) > 1) {
      const totalEquityNow = d.ledger.ownerEquityContributed + d.ledger.retainedEarnings;
      d.ledger.ownerEquityContributed = trueContributed;
      d.ledger.retainedEarnings = totalEquityNow - trueContributed;
      state.toasts.push({
        id: `migrate_${d.id}_equitysplit`,
        text: `${d.name}: corrected an accounting quirk that had thrown Owner Contributed and Retained Earnings off by equal, opposite amounts — total equity is unchanged.`,
        kind: "info",
        day: state.day,
      });
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
  // The economy engine moved from a nullable random-event pool to always
  // having a current named era (see engine/economy.ts) — an old save's
  // shape is incompatible, so it just gets a fresh economy state rather
  // than trying to translate the old fields. Nothing else in the save is
  // affected.
  if (!state.economy || !(state.economy as { currentEra?: unknown }).currentEra) state.economy = newEconomyState();
  if (state.acquiredManufacturer === undefined) state.acquiredManufacturer = null;
  if (!state.manufacturerAcquisitionTargets) state.manufacturerAcquisitionTargets = [];
  if (state.manufacturerAcquisitionTargetsMonth === undefined) state.manufacturerAcquisitionTargetsMonth = -1;
  if (state.takeoverThreat === undefined) state.takeoverThreat = null;
  if (!state.eventLog) state.eventLog = [];
  if (!state.scheduledRipples) state.scheduledRipples = [];
  if (!state.pendingEventModal) state.pendingEventModal = [];
  // Equity used to be a one-time, un-topped-up stake with no store it was
  // actually tied to — an existing partial owner's save has no record of
  // which dealership that was. Best guess: whichever store they had open
  // when they saved, since that's usually still their original one.
  if (state.career.equityDealershipId === undefined) {
    state.career.equityDealershipId = state.career.role === "partial_owner" ? state.activeDealershipId : null;
  }
  if (state.career.lifetimeDistributions === undefined) state.career.lifetimeDistributions = 0;
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
