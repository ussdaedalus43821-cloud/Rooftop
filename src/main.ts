import { createNewGame } from "./state.js";
import { loadGame, saveGame } from "./persistence.js";
import { Rng } from "./rng.js";
import { advanceOneDay, pushToast } from "./engine/engine.js";
import { msPerGameDay } from "./engine/clock.js";
import { isNewGameSetupActive, mountApp, render } from "./ui/app.js";
import { money } from "./ui/format.js";
import { writeToConnectedFile } from "./fsAccess.js";
import type { GameState } from "./types.js";

const RECENT_ACQUISITION_GRACE_DAYS = 45;

const AUTOSAVE_INTERVAL_MS = 8000;

function boot(): void {
  const root = document.getElementById("app");
  if (!root) return;

  const loaded = loadGame();
  const isNewPlayer = !loaded;
  const state: GameState = loaded ?? createNewGame();
  const rng = new Rng(state.rngState || state.seed);

  let dirty = false;
  const markDirty = () => {
    dirty = true;
  };

  mountApp(root, state, rng, markDirty, isNewPlayer);

  let lastFrame = performance.now();
  let lastAutosave = performance.now();
  let lastSaveFailed = false; // avoid re-toasting the same failure every 8s while it persists
  let lastFileSaveNeedsPermission = false; // avoid re-toasting the same "reconnect your file" nudge every 8s
  let fileWriteInFlight = false; // a File System Access write is async — never overlap two on top of each other

  function frame(now: number): void {
    const elapsed = now - lastFrame;
    lastFrame = now;

    if (state.speed > 0 && !state.gameOver && !isNewGameSetupActive() && !state.career.milestoneOfferPending && state.pendingEventModal.length === 0) {
      state.realMsAccumulator += elapsed;
      const perDay = msPerGameDay(state.speed);
      let advanced = false;
      let guard = 0;
      while (state.realMsAccumulator >= perDay && guard < 60) {
        state.realMsAccumulator -= perDay;
        advanceOneDay(state, rng);
        advanced = true;
        guard += 1;
        checkFailure(state);
        if (state.gameOver) break;
      }
      if (advanced) {
        dirty = true;
        render();
      }
    }

    if (state.settings.autoSaveEnabled && now - lastAutosave > AUTOSAVE_INTERVAL_MS) {
      lastAutosave = now;
      if (dirty) {
        const result = saveGame(state);
        if (result.ok) {
          state.lastSavedDay = state.day;
          dirty = false;
          lastSaveFailed = false;
        } else if (!lastSaveFailed) {
          lastSaveFailed = true;
          pushToast(state, `Autosave failed: ${result.error}`, "bad");
          render();
        }

        if (!fileWriteInFlight) {
          fileWriteInFlight = true;
          writeToConnectedFile(state)
            .then((fileResult) => {
              fileWriteInFlight = false;
              if (fileResult.ok) {
                lastFileSaveNeedsPermission = false;
              } else if (fileResult.needsPermission && !lastFileSaveNeedsPermission) {
                lastFileSaveNeedsPermission = true;
                pushToast(state, "Your connected save file needs to be reconnected — head to Settings.", "warn");
                render();
              }
              // A file that was never connected reports { ok: false, error: "No file connected." } every tick by design — that's the common case, not a failure worth surfacing.
            })
            .catch(() => {
              fileWriteInFlight = false;
            });
        }
      }
    }

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);

  window.addEventListener("beforeunload", () => {
    if (state.settings.autoSaveEnabled) saveGame(state);
  });
}

function checkFailure(state: GameState): void {
  if (state.gameOver) return;
  for (const d of Object.values(state.dealerships)) {
    if (d.failure !== "floorplan_seized") continue;

    const onlyStore = Object.keys(state.dealerships).length === 1;
    if (onlyStore) {
      state.gameOver = {
        kind: "floorplan_seized",
        message: `${d.name}'s floor-plan lender conducted an audit, found unpaid curtailment and sold-out-of-trust units, and swept the line. The store can no longer finance inventory.`,
      };
      return;
    }

    // Owning more than one rooftop means one failing shouldn't end the whole
    // game — that store closes and drops out of the group, everything else
    // keeps running. A store bought very recently gets a partial refund: you
    // hadn't really had a chance to run it before it went under.
    const recentAcquisition = d.acquiredDay !== undefined && d.acquiredCost !== undefined && state.day - d.acquiredDay <= RECENT_ACQUISITION_GRACE_DAYS;
    let refundNote = "";
    if (recentAcquisition) {
      const refund = Math.round(d.acquiredCost! * 0.5);
      state.groupTreasury += refund;
      refundNote = ` Since you'd only just taken it over, the purchase agreement's contingency covered part of the loss — ${money(refund)} returned to your group treasury.`;
    }
    pushToast(state, `${d.name}'s floor-plan lender pulled the line and seized the store — it's closed and out of your group.${refundNote}`, "bad");
    delete state.dealerships[d.id];
    if (state.activeDealershipId === d.id) {
      state.activeDealershipId = Object.keys(state.dealerships)[0];
    }
    return;
  }
}

boot();
