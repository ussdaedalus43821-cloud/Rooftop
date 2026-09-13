import type { TabModule } from "./types.js";
import { exportSaveToFile, importSaveFromFile, saveGame } from "../persistence.js";
import { pushToast } from "../engine/engine.js";
import { isFileSystemAccessSupported, connectSaveFile, reconnectSaveFile, disconnectSaveFile, getConnectedFileName } from "../fsAccess.js";

let connectedFileName: string | null | undefined = undefined; // undefined = not checked yet this session
let checkingFileName = false;

function ensureFileNameChecked(ctx: Parameters<NonNullable<TabModule["render"]>>[0]): void {
  if (connectedFileName !== undefined || checkingFileName) return;
  checkingFileName = true;
  getConnectedFileName().then((name) => {
    connectedFileName = name;
    checkingFileName = false;
    ctx.rerender();
  });
}

export const settingsTab: TabModule = {
  key: "settings",
  label: "Settings",
  render(ctx) {
    const s = ctx.state.settings;
    const behind = ctx.state.day - ctx.state.lastSavedDay;
    ensureFileNameChecked(ctx);
    const supported = isFileSystemAccessSupported();

    const fileAutoSaveCard = `
      <div class="card" style="max-width:520px;margin-top:14px;">
        <h3>Auto-Save To A File On Your Device</h3>
        ${!supported ? `
          <p class="text-faint" style="font-size:12.5px;">This browser (Safari and Firefox, notably) doesn't support saving straight to a file on your device — that's a platform limit, not something Rooftop can work around here. Use the Save Backup File section below instead; it takes one extra click but the result is the same, a real file you keep.</p>
        ` : connectedFileName ? `
          <p class="text-faint" style="font-size:12.5px;">Autosave is writing directly to <strong>${escapeHtml(connectedFileName)}</strong> every few seconds — no manual download needed. If your browser ever revokes permission (it can after being closed a while), reconnect below.</p>
          <div class="btn-row">
            <button class="btn btn-sm" data-action="settings:reconnectFile">Reconnect</button>
            <button class="btn btn-sm btn-bad" data-action="settings:disconnectFile">Disconnect</button>
          </div>
        ` : `
          <p class="text-faint" style="font-size:12.5px;">Pick (or create) a file once, and every autosave writes to it automatically from then on — a real file on your drive that survives browser storage getting cleared, with nothing to remember to click.</p>
          <div class="btn-row">
            <button class="btn btn-primary" data-action="settings:connectFile">Connect A Save File</button>
          </div>
        `}
      </div>`;

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
        <p class="text-faint" style="font-size:12px;margin-top:8px;">Last saved to this browser: Day ${ctx.state.lastSavedDay}${behind > 0 ? ` <span class="text-warn">(${behind} day${behind === 1 ? "" : "s"} of progress not yet saved)</span>` : " — up to date"}.</p>
      </div>
      ${fileAutoSaveCard}
      <div class="card" style="max-width:520px;margin-top:14px;">
        <h3>Save Backup File</h3>
        <p class="text-faint" style="font-size:12.5px;">Browser storage (what autosave uses) can get cleared by the browser itself — Safari in particular will wipe it if you don't open the site for a while, or if it needs the space back. A downloaded backup is a real file on your device that isn't subject to any of that — keep one somewhere safe (Files app, cloud drive) and reload it any time.</p>
        <div class="btn-row">
          <button class="btn btn-primary" data-action="settings:exportSave">Download Save Backup</button>
          <label class="btn" for="rooftop-import-save">Load Save From File</label>
          <input type="file" id="rooftop-import-save" accept=".json,application/json" data-action="settings:importSave" style="display:none;" />
        </div>
      </div>
      <div class="card" style="max-width:520px;margin-top:14px;">
        <h3>About This Save</h3>
        <p class="text-faint" style="font-size:12.5px;">Seed ${ctx.state.seed} · Day ${ctx.state.day} · Version ${ctx.state.version}</p>
        <p class="text-faint" style="font-size:12.5px;">Progress autosaves to this browser's local storage. Clearing site data will erase your save — download a backup file above (or connect an auto-save file) if you want a copy that survives that.</p>
      </div>
    `;
  },
  onAction(ctx, action) {
    if (action === "settings:saveNow") {
      const result = saveGame(ctx.state);
      if (result.ok) {
        ctx.state.lastSavedDay = ctx.state.day;
        pushToast(ctx.state, "Game saved.", "good");
      } else {
        pushToast(ctx.state, `Save failed: ${result.error}`, "bad");
      }
      return true;
    }
    if (action === "settings:exportSave") {
      exportSaveToFile(ctx.state);
      pushToast(ctx.state, "Save file downloaded.", "good");
      return true;
    }
    if (action === "settings:connectFile") {
      connectSaveFile(ctx.state).then((result) => {
        if (result.ok) {
          connectedFileName = result.fileName ?? null;
          pushToast(ctx.state, `Connected — autosave will write to ${result.fileName} from now on.`, "good");
        } else if (result.error) {
          pushToast(ctx.state, result.error, "bad");
        }
        ctx.rerender();
      });
      return false;
    }
    if (action === "settings:reconnectFile") {
      reconnectSaveFile(ctx.state).then((result) => {
        if (result.ok) {
          pushToast(ctx.state, "Reconnected — autosave is writing to your file again.", "good");
        } else if (result.error) {
          pushToast(ctx.state, result.error, "bad");
        }
        ctx.rerender();
      });
      return false;
    }
    if (action === "settings:disconnectFile") {
      if (!confirm("Disconnect this save file? Autosave will go back to browser storage only.")) return false;
      disconnectSaveFile().then(() => {
        connectedFileName = null;
        pushToast(ctx.state, "Disconnected.", "info");
        ctx.rerender();
      });
      return false;
    }
    return false;
  },
  onInput(ctx, action, target) {
    if (action === "settings:autosave" && target instanceof HTMLInputElement) {
      ctx.state.settings.autoSaveEnabled = target.checked;
      return true;
    }
    if (action === "settings:importSave" && target instanceof HTMLInputElement) {
      const file = target.files?.[0];
      if (!file) return false;
      if (!confirm("Load this save file? It will replace your current game.")) return false;
      importSaveFromFile(file)
        .then((loaded) => {
          Object.assign(ctx.state, loaded);
          const result = saveGame(ctx.state);
          if (result.ok) ctx.state.lastSavedDay = ctx.state.day;
          pushToast(ctx.state, "Save loaded from file.", "good");
          ctx.rerender();
        })
        .catch((err: Error) => {
          pushToast(ctx.state, err.message || "Couldn't load that file.", "bad");
          ctx.rerender();
        });
      return false;
    }
    return false;
  },
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
