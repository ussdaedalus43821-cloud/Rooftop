import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";

// Some sandboxed dev/CI environments pre-install Chromium outside
// Playwright's normal managed browser cache (see PLAYWRIGHT_BROWSERS_PATH)
// and block downloading a second copy. Fall back to that install only when
// it's actually present, so this config still works unmodified on a normal
// machine that installs its own browsers via `npx playwright install`.
const sandboxChromium = "/opt/pw-browsers/chromium";
const executablePath = fs.existsSync(sandboxChromium) ? sandboxChromium : undefined;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:8099",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npx http-server . -p 8099 -s",
    url: "http://localhost:8099",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: executablePath ? { executablePath } : {},
      },
    },
  ],
});
