const SAVE_KEY = "rooftop.save.v1";
export function saveGame(state) {
    try {
        const json = JSON.stringify(state);
        localStorage.setItem(SAVE_KEY, json);
    }
    catch (err) {
        console.error("Rooftop: failed to save game", err);
    }
}
export function loadGame() {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw)
            return null;
        return JSON.parse(raw);
    }
    catch (err) {
        console.error("Rooftop: failed to load game", err);
        return null;
    }
}
export function clearSave() {
    try {
        localStorage.removeItem(SAVE_KEY);
    }
    catch (err) {
        console.error("Rooftop: failed to clear save", err);
    }
}
export function hasSave() {
    try {
        return localStorage.getItem(SAVE_KEY) !== null;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=persistence.js.map