// Small, dependency-free inline-SVG charts for the Financials tab. No chart
// library — these are hand-rolled to match the rest of Rooftop's zero-
// dependency philosophy, using the app's own dark-surface palette (see
// styles/main.css) rather than a separate chart theme. The 4-color
// categorical set below is validated against this app's real card surface
// (#202a42) for colorblind-safe adjacent-pair separation.
import type { MonthlyFinancials } from "../types.js";

const GOOD = "#3ecf8e"; // var(--good)
const BAD = "#f2545b"; // var(--bad)
const AXIS = "#3a4560"; // one step off the card surface — hairline gridlines/baseline
const AXIS_TEXT = "#6b7794"; // var(--text-faint)

interface GrossSeries {
  key: "frontEndGross" | "fiGross" | "serviceGross" | "partsGross";
  label: string;
  color: string;
}

// Fixed order, never cycled — validated (dark mode, #202a42 surface) for
// worst-case adjacent CVD separation via the dataviz skill's validator.
const GROSS_SERIES: GrossSeries[] = [
  { key: "frontEndGross", label: "Front End", color: "#3987e5" },
  { key: "fiGross", label: "F&I", color: "#d95926" },
  { key: "serviceGross", label: "Service", color: "#199e70" },
  { key: "partsGross", label: "Parts", color: "#c98500" },
];

function shortMonth(label: string): string {
  const m = label.match(/^(\w{3})\w* Year (\d+)$/);
  return m ? `${m[1]} '${m[2]}` : label;
}

function compactMoney(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${Math.round(abs)}`;
}

const W = 640;
const H = 210;
const PAD_TOP = 18;
const PAD_BOTTOM = 26;
const PAD_X = 8;

/** Monthly net income, last 12 months — a status/polarity job, so bars are colored by sign rather than an arbitrary hue, matching the P&L table's own green/red convention. */
export function renderNetIncomeChart(history: MonthlyFinancials[]): string {
  const months = history.slice(-12);
  if (months.length === 0) {
    return `<p class="text-faint" style="font-size:12px;">Not enough history yet — check back after a full month.</p>`;
  }

  const values = months.map((m) => m.netIncome);
  const maxVal = Math.max(0, ...values);
  const minVal = Math.min(0, ...values);
  const range = maxVal - minVal || 1;
  const plotH = H - PAD_TOP - PAD_BOTTOM;
  const y = (v: number) => PAD_TOP + ((maxVal - v) / range) * plotH;
  const baselineY = y(0);

  const plotW = W - PAD_X * 2;
  const band = plotW / months.length;
  const barW = Math.min(24, band - 3);

  const bars = months.map((m, i) => {
    const cx = PAD_X + band * i + band / 2;
    const x = cx - barW / 2;
    const v = m.netIncome;
    const top = Math.min(y(v), baselineY);
    const h = Math.max(0.5, Math.abs(y(v) - baselineY));
    const color = v >= 0 ? GOOD : BAD;
    const showLabel = i === 0 || i === months.length - 1;
    return `
      <rect x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${color}">
        <title>${m.monthLabel}: ${v < 0 ? "-" : ""}$${Math.round(Math.abs(v)).toLocaleString()}</title>
      </rect>
      ${showLabel ? `<text x="${cx.toFixed(1)}" y="${H - 8}" font-size="10" fill="${AXIS_TEXT}" text-anchor="middle">${shortMonth(m.monthLabel)}</text>` : ""}
    `;
  }).join("");

  return `
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;" role="img" aria-label="Monthly net income, last ${months.length} months">
      <line x1="${PAD_X}" y1="${baselineY.toFixed(1)}" x2="${W - PAD_X}" y2="${baselineY.toFixed(1)}" stroke="${AXIS}" stroke-width="1" />
      <text x="${PAD_X}" y="${(baselineY - 4).toFixed(1)}" font-size="10" fill="${AXIS_TEXT}">$0</text>
      <text x="${PAD_X}" y="${PAD_TOP - 4}" font-size="10" fill="${AXIS_TEXT}">${compactMoney(maxVal)}</text>
      ${minVal < 0 ? `<text x="${PAD_X}" y="${H - PAD_BOTTOM + 12}" font-size="10" fill="${AXIS_TEXT}">${compactMoney(minVal)}</text>` : ""}
      ${bars}
    </svg>`;
}

/** Gross profit by department, last 12 months — where the money actually comes from, stacked so the total gross and the mix are both visible at once. */
export function renderGrossProfitChart(history: MonthlyFinancials[]): string {
  const months = history.slice(-12);
  if (months.length === 0) {
    return `<p class="text-faint" style="font-size:12px;">Not enough history yet — check back after a full month.</p>`;
  }

  const totals = months.map((m) => GROSS_SERIES.reduce((sum, s) => sum + Math.max(0, m[s.key]), 0));
  const maxTotal = Math.max(1, ...totals);
  const plotH = H - PAD_TOP - PAD_BOTTOM;
  const baselineY = PAD_TOP + plotH;
  const scale = plotH / maxTotal;

  const plotW = W - PAD_X * 2;
  const band = plotW / months.length;
  const barW = Math.min(24, band - 3);

  const bars = months.map((m, i) => {
    const cx = PAD_X + band * i + band / 2;
    const x = cx - barW / 2;
    let cumulative = 0;
    const segs = GROSS_SERIES.map((s, si) => {
      const v = Math.max(0, m[s.key]);
      const segH = v * scale;
      const segBottom = baselineY - cumulative;
      cumulative += segH;
      const isTop = si === GROSS_SERIES.length - 1 || GROSS_SERIES.slice(si + 1).every((s2) => Math.max(0, m[s2.key]) === 0);
      const top = segBottom - segH;
      // 1px inset top/bottom => a 2px gap where two segments meet, without a border.
      const insetTop = top + 1;
      const insetH = Math.max(0, segH - (isTop ? 1 : 2));
      if (insetH <= 0) return "";
      return `<rect x="${x.toFixed(1)}" y="${insetTop.toFixed(1)}" width="${barW.toFixed(1)}" height="${insetH.toFixed(1)}" rx="3" fill="${s.color}"><title>${s.label} — ${m.monthLabel}: $${Math.round(v).toLocaleString()}</title></rect>`;
    }).join("");
    const showLabel = i === 0 || i === months.length - 1;
    return `${segs}${showLabel ? `<text x="${cx.toFixed(1)}" y="${H - 8}" font-size="10" fill="${AXIS_TEXT}" text-anchor="middle">${shortMonth(m.monthLabel)}</text>` : ""}`;
  }).join("");

  const legend = GROSS_SERIES.map((s) => `
    <span style="display:inline-flex;align-items:center;gap:4px;margin-right:12px;">
      <span style="width:9px;height:9px;border-radius:2px;background:${s.color};display:inline-block;"></span>
      <span class="text-faint" style="font-size:11px;">${s.label}</span>
    </span>`).join("");

  return `
    <div style="margin-bottom:6px;">${legend}</div>
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;" role="img" aria-label="Gross profit by department, last ${months.length} months">
      <line x1="${PAD_X}" y1="${baselineY.toFixed(1)}" x2="${W - PAD_X}" y2="${baselineY.toFixed(1)}" stroke="${AXIS}" stroke-width="1" />
      <text x="${PAD_X}" y="${PAD_TOP - 4}" font-size="10" fill="${AXIS_TEXT}">${compactMoney(maxTotal)}</text>
      <text x="${PAD_X}" y="${(baselineY - 4).toFixed(1)}" font-size="10" fill="${AXIS_TEXT}">$0</text>
      ${bars}
    </svg>`;
}
