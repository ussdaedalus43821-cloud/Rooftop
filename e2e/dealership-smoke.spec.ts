import { test, expect, type Page } from "@playwright/test";
import { createNewGame } from "../dist/state.js";
import { advanceOneDay } from "../dist/engine/engine.js";
import { Rng } from "../dist/rng.js";
import { setInsuranceTier } from "../dist/engine/insurance.js";
import type { GameState } from "../src/types.js";

// ---------------------------------------------------------------------------
// This suite drives the real engine headlessly, against the same dist/
// output the deployed app ships (run `npm run build` first — `npm run
// test:e2e` does this for you) — not a bundler, not mocks. Every fixture
// below runs with a fixed RNG seed so the resulting save is byte-for-byte
// reproducible: no flaky "eventually rolls a recession" tests, no shipped
// save-file blob to keep in sync with the current state shape.
//
// Deliberately no shared beforeEach save load: the three scenarios need
// different starting states (a forced Credit Crisis era, a hand-built
// pending event, a multi-month history), so beforeEach here sets up what
// IS common to every test — deterministic console/page-error capture —
// and each test loads its own save via loadSave() as its first line.
// ---------------------------------------------------------------------------

function buildCreditCrisisLossMonthSave(): string {
  const state: GameState = createNewGame(1, "toyota");
  const d = state.dealerships[state.activeDealershipId];
  d.autoPilot = { sales: true, fi: true, auction: true, allocation: true, treasury: true };
  for (const s of d.staff) s.skill = 10; // a deliberately weak team, stacked on top of a bad economy
  const rng = new Rng(state.rngState || 1);

  // Force a sustained Credit Crisis era at its worst realistic demand floor
  // — see engine/economy.ts's economyMarginMultiplier, which is what makes
  // this actually bite (a downturn compresses margin on every deal, not
  // just raw traffic, which turned out to be absorbed by ordinary
  // staffing/inventory slack).
  state.economy.currentEra = {
    regime: "creditShock",
    headline: "Credit Crisis",
    description: "Forced for a deterministic e2e fixture.",
    startDay: state.day,
    endDay: state.day + 720,
    demandMult: 0.6,
    rateAdj: 0.05,
    priceToleranceMult: 1,
  };
  state.economy.sentiment = 0.85;

  for (let day = 1; day <= 40; day++) {
    if (d.failure) break;
    advanceOneDay(state, rng);
    state.pendingEventModal = []; // headless fixture-building: nothing answers Pay Now/Contest/sign-off notices
    state.economy.sentiment = 0.85; // hold the floor so the fixture doesn't drift with sentiment mean-reversion
  }

  if (d.monthlyHistory.length < 1 || d.monthlyHistory[0].netIncome >= 0) {
    throw new Error(
      `buildCreditCrisisLossMonthSave: expected a completed, negative first month — got ${JSON.stringify(d.monthlyHistory[0])}. ` +
        "The economy/margin-compression balance may have changed; re-tune the fixture."
    );
  }
  return JSON.stringify(state);
}

function buildTestDriveTotalLossEventSave(): string {
  const state: GameState = createNewGame(2, "toyota");
  const d = state.dealerships[state.activeDealershipId];

  // Constructed by hand rather than simulated — a real test-drive-collision
  // roll is rare and RNG-timing-dependent (see engine/randomEvents.ts), so
  // this builds the exact record shape dailyRandomEventCheck would produce
  // for a "total loss" severity roll, insured, without depending on luck.
  state.pendingEventModal.push({
    day: state.day,
    dealershipId: d.id,
    dealershipName: d.name,
    kind: "test_drive_collision",
    headline: `${d.name}: a test drive ended in a total loss.`,
    detail: "A customer test-driving a Camry XLE was involved in a collision — a total loss ($28,400).",
    lossAmount: 28_400,
    insurancePayout: 24_400,
    isRipple: false,
  });
  return JSON.stringify(state);
}

function buildFinancialsHistorySave(): string {
  const state: GameState = createNewGame(3, "toyota");
  const d = state.dealerships[state.activeDealershipId];
  d.autoPilot = { sales: true, fi: true, auction: true, allocation: true, treasury: true };
  setInsuranceTier(d, "standard"); // so the Insurance P&L column is genuinely nonzero, not just $0-if-uninsured
  const rng = new Rng(state.rngState || 3);
  for (let day = 1; day <= 95; day++) {
    if (d.failure) break;
    advanceOneDay(state, rng);
    state.pendingEventModal = [];
  }

  if (d.monthlyHistory.length < 2) {
    throw new Error(`buildFinancialsHistorySave: expected at least 2 completed months — got ${d.monthlyHistory.length}.`);
  }
  return JSON.stringify(state);
}

async function loadSave(page: Page, saveJson: string): Promise<void> {
  await page.addInitScript((json) => {
    window.addEventListener("beforeunload", (e) => e.stopImmediatePropagation(), true);
    localStorage.setItem("rooftop.save.v1", json);
  }, saveJson);
  await page.goto("/");
  await page.waitForLoadState("load");
}

test.describe("Rooftop dealership smoke tests", () => {
  let consoleErrors: string[];

  test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    page.on("pageerror", (e) => consoleErrors.push(`[pageerror] ${e}`));
    page.on("console", (msg) => {
      // A missing favicon is a harmless 404 in this static-file setup, not an app bug.
      if (msg.type() === "error" && !msg.text().includes("404")) consoleErrors.push(`[console] ${msg.text()}`);
    });
  });

  test("renders a completed loss month during a forced Credit Crisis era", async ({ page }) => {
    await loadSave(page, buildCreditCrisisLossMonthSave());

    await page.locator('button:has-text("Financials")').first().click();
    await page.waitForTimeout(300);

    // Scoped to the Monthly P&L card specifically — the Balance Sheet card
    // renders its own <table> first, with no <strong> cells, so an
    // unscoped "table tbody tr" would match the wrong table.
    const plCard = page.locator(".card", { hasText: "Monthly P&L" });
    const firstRow = plCard.locator("table tbody tr").first();
    const netIncomeCell = firstRow.locator("td").filter({ has: page.locator("strong") });
    await expect(netIncomeCell).toBeVisible();
    await expect(netIncomeCell).toHaveClass(/text-bad/);
    await expect(netIncomeCell).toContainText("-$");

    await expect(page.getByText("The books balance exactly.")).toBeVisible();

    expect(consoleErrors).toEqual([]);
  });

  test("a test-drive collision total-loss notice triggers and resolves without breaking the UI", async ({ page }) => {
    await loadSave(page, buildTestDriveTotalLossEventSave());

    const modal = page.locator(".modal-backdrop");
    await expect(modal).toHaveCount(1);
    await expect(modal).toContainText("Test-Drive Collision");
    await expect(modal).toContainText("$28,400");
    await expect(modal).toContainText("$24,400");

    const approveBtn = page.locator('button[data-action="event:acknowledge"]');
    const sigInput = page.locator('input[data-action="event:setSignature"]');

    // The notice is a formal sign-off, not a one-click dismiss: approving requires a signature first.
    await expect(approveBtn).toBeDisabled();
    await sigInput.fill("QA Reviewer");
    await sigInput.dispatchEvent("change");
    await expect(approveBtn).toBeEnabled();
    await approveBtn.click();

    await expect(modal).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });

  test("financial figures display correctly across a multi-month history", async ({ page }) => {
    await loadSave(page, buildFinancialsHistorySave());

    await page.locator('button:has-text("Financials")').first().click();
    await page.waitForTimeout(300);

    const plCard = page.locator(".card", { hasText: "Monthly P&L" });
    const rows = plCard.locator("table tbody tr");
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThanOrEqual(2);

    // Every completed month's Net Income cell should show a real, well-formed dollar figure — never blank/NaN/undefined.
    for (let i = 0; i < rowCount; i++) {
      const netIncomeCell = rows.nth(i).locator("td").filter({ has: page.locator("strong") });
      const text = await netIncomeCell.innerText();
      expect(text).toMatch(/^-?\$[\d,]+$/);
    }

    // Insurance column (15th data column) should be a genuine nonzero premium — this store is insured.
    const insuranceCell = rows.first().locator("td").nth(14);
    const insuranceText = await insuranceCell.innerText();
    expect(insuranceText).toMatch(/^-?\$[\d,]+$/);
    expect(insuranceText).not.toBe("$0");

    await expect(page.getByText("The books balance exactly.")).toBeVisible();

    expect(consoleErrors).toEqual([]);
  });
});
