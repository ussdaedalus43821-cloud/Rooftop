import type { TabModule } from "./types.js";
import { saveGame } from "../persistence.js";
import { pushToast } from "../engine/engine.js";

export const settingsTab: TabModule = {
  key: "settings",
  label: "Settings",
  render(ctx) {
    const s = ctx.state.settings;
    return `
      <div class="card" style="max-width:520px;">
        <h3>Save &amp; Simulation</h3>
        <div class="form-row">
          <label><input type="checkbox" data-action="settings:autosave" ${s.autoSaveEnabled ? "checked" : ""} /> Autosave enabled</label>
        </div>
        <div class="btn-row">
          <button class="btn btn-primary" data-action="settings:saveNow">Save Now</button>
          <button class="btn btn-bad" data-action="global:newGame">Reset / New Game</button>
        </div>
      </div>
      <div class="card" style="max-width:520px;margin-top:14px;">
        <h3>About This Save</h3>
        <p class="text-faint" style="font-size:12.5px;">Seed ${ctx.state.seed} · Day ${ctx.state.day} · Version ${ctx.state.version}</p>
        <p class="text-faint" style="font-size:12.5px;">Progress autosaves to this browser's local storage. Clearing site data will erase your save.</p>
      </div>
    `;
  },
  onAction(ctx, action) {
    if (action === "settings:saveNow") {
      saveGame(ctx.state);
      pushToast(ctx.state, "Game saved.", "good");
      return true;
    }
    return false;
  },
  onInput(ctx, action, target) {
    if (action === "settings:autosave" && target instanceof HTMLInputElement) {
      ctx.state.settings.autoSaveEnabled = target.checked;
      return true;
    }
    return false;
  },
};
