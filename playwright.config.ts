import { defineConfig } from "@playwright/test";
import fs from "fs";
import path from "path";

// Load .env.local so tests can run with just `npm run test:e2e`
const envPath = path.resolve(__dirname, ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx);
    const val = trimmed.slice(eqIdx + 1);
    if (!process.env[key]) process.env[key] = val;
  }
}

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["./e2e/fixtures/summary-reporter.ts"],
  ],
  use: {
    baseURL: "http://localhost:3000",
    screenshot: "on",
    trace: "retain-on-failure",
    actionTimeout: 15_000,
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        storageState: "e2e/.auth/user.json",
      },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: "npm run dev",
    port: 3000,
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
