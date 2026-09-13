import { createNewGame } from "./state.js";
import { loadGame, saveGame } from "./persistence.js";
import { Rng } from "./rng.js";
import { advanceOneDay } from "./engine/engine.js";
import { msPerGameDay } from "./engine/clock.js";
import { isNewGameSetupActive, mountApp, render } from "./ui/app.js";
import type { GameState } from "./types.js";

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

  function frame(now: number): void {
    const elapsed = now - lastFrame;
    lastFrame = now;

    if (state.speed > 0 && !state.gameOver && !isNewGameSetupActive() && !state.career.milestoneOfferPending) {
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
        saveGame(state);
        state.lastSavedDay = state.day;
        dirty = false;
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
    if (d.failure === "floorplan_seized") {
      state.gameOver = {
        kind: "floorplan_seized",
        message: `${d.name}'s floor-plan lender conducted an audit, found unpaid curtailment and sold-out-of-trust units, and swept the line. The store can no longer finance inventory.`,
      };
      return;
    }
  }
}

boot();
