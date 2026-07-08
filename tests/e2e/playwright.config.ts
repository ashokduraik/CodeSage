import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { defineConfig } from "@playwright/test";

const e2eDir = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(e2eDir, ".env");

if (!existsSync(envPath)) {
  throw new Error(
    "Missing tests/e2e/.env — copy tests/e2e/.env.example to tests/e2e/.env and adjust values.",
  );
}

dotenv.config({ path: envPath });

/**
 * Parses common truthy env strings (`1`, `true`, `yes`).
 *
 * @param raw - Raw environment value.
 * @returns Whether the value is truthy.
 */
function isTruthy(raw: string | undefined): boolean {
  if (raw === undefined) {
    return false;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

const headless = isTruthy(process.env.E2E_HEADLESS);

export default defineConfig({
  testDir: ".",
  globalSetup: "./global-setup.ts",
  timeout: 180_000,
  expect: {
    timeout: 10_000,
  },
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173",
    headless,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
