// ---------------------------------------------------------------------------
// Optional File System Access API integration: lets autosave write straight
// to a real file on the player's own device, once they've picked one, so
// progress lives somewhere sturdier than browser storage without needing a
// manual download every time. Only Chromium-based browsers support this API
// today (not Safari/iOS, not Firefox) — everywhere else this module reports
// unsupported and the app falls back to the existing manual backup file
// (persistence.ts's exportSaveToFile/importSaveFromFile).
// ---------------------------------------------------------------------------
import type { GameState } from "./types.js";

const DB_NAME = "rooftop-fs-handles";
const STORE_NAME = "handles";
const HANDLE_KEY = "saveFile";

export function isFileSystemAccessSupported(): boolean {
  return typeof (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker === "function";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

let cachedHandle: FileSystemFileHandle | null = null;

async function getHandle(): Promise<FileSystemFileHandle | null> {
  if (cachedHandle) return cachedHandle;
  try {
    const handle = await idbGet<FileSystemFileHandle>(HANDLE_KEY);
    cachedHandle = handle ?? null;
    return cachedHandle;
  } catch {
    return null;
  }
}

export async function getConnectedFileName(): Promise<string | null> {
  const handle = await getHandle();
  return handle ? handle.name : null;
}

async function writeHandle(handle: FileSystemFileHandle, state: GameState): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(state));
  await writable.close();
}

export interface ConnectResult {
  ok: boolean;
  error?: string;
  fileName?: string;
}

/** One-time setup: player picks (or creates) a file via the native OS save dialog; the handle is remembered in IndexedDB so future autosaves can write to it without asking again. */
export async function connectSaveFile(state: GameState): Promise<ConnectResult> {
  if (!isFileSystemAccessSupported()) {
    return { ok: false, error: "This browser doesn't support saving directly to a file on your device — use the download/upload backup below instead." };
  }
  try {
    const picker = (window as unknown as { showSaveFilePicker: (opts: unknown) => Promise<FileSystemFileHandle> }).showSaveFilePicker;
    const handle = await picker({
      suggestedName: "rooftop-save.json",
      types: [{ description: "Rooftop Save", accept: { "application/json": [".json"] } }],
    });
    await writeHandle(handle, state);
    await idbSet(HANDLE_KEY, handle);
    cachedHandle = handle;
    return { ok: true, fileName: handle.name };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return { ok: false }; // the player closed the picker — not a failure worth reporting
    console.error("Rooftop: failed to connect save file", err);
    return { ok: false, error: "Couldn't set up that file." };
  }
}

export interface WriteResult {
  ok: boolean;
  error?: string;
  needsPermission?: boolean; // the browser dropped write permission for the restored handle; needs a user click (reconnectSaveFile) to get it back, can't be silently re-requested from a background autosave tick
}

/** Silent write path used by the autosave loop — never prompts, since it can run with no user gesture behind it. */
export async function writeToConnectedFile(state: GameState): Promise<WriteResult> {
  const handle = await getHandle();
  if (!handle) return { ok: false, error: "No file connected." };
  try {
    const query = (handle as unknown as { queryPermission: (opts: { mode: string }) => Promise<PermissionState> }).queryPermission;
    const perm = await query.call(handle, { mode: "readwrite" });
    if (perm !== "granted") return { ok: false, needsPermission: true, error: "The connected save file needs to be reconnected." };
    await writeHandle(handle, state);
    return { ok: true };
  } catch (err) {
    console.error("Rooftop: failed to write to connected save file", err);
    return { ok: false, error: "Couldn't write to the connected file." };
  }
}

/** Re-grants write permission for a handle restored from a previous session. Must be called from a direct user click (e.g. a "Reconnect" button) — browsers require a user gesture to show the permission prompt. */
export async function reconnectSaveFile(state: GameState): Promise<ConnectResult> {
  const handle = await getHandle();
  if (!handle) return { ok: false, error: "No file connected." };
  try {
    const request = (handle as unknown as { requestPermission: (opts: { mode: string }) => Promise<PermissionState> }).requestPermission;
    const perm = await request.call(handle, { mode: "readwrite" });
    if (perm !== "granted") return { ok: false, error: "Permission to write to that file was denied." };
    await writeHandle(handle, state);
    return { ok: true, fileName: handle.name };
  } catch (err) {
    console.error("Rooftop: failed to reconnect save file", err);
    return { ok: false, error: "Couldn't reconnect to that file." };
  }
}

export async function disconnectSaveFile(): Promise<void> {
  cachedHandle = null;
  try {
    await idbDelete(HANDLE_KEY);
  } catch {
    // best-effort
  }
}
