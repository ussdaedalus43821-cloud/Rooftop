export function money(n) {
    const sign = n < 0 ? "-" : "";
    return `${sign}$${Math.abs(Math.round(n)).toLocaleString()}`;
}
export function moneyCents(n) {
    const sign = n < 0 ? "-" : "";
    return `${sign}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
export function pct(n, digits = 0) {
    return `${(n * 100).toFixed(digits)}%`;
}
export function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
export function meterClass(value, goodAt, warnAt) {
    if (value >= goodAt)
        return "good";
    if (value >= warnAt)
        return "warn";
    return "bad";
}
//# sourceMappingURL=format.js.map