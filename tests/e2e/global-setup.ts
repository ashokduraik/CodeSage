import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

import {
  validateAgentQaToolSupport,
  validateE2eEnv,
} from "./helpers/validate-e2e-env";

const e2eDir = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(e2eDir, ".env");

/**
 * Playwright global setup: validate env, verify the dev stack is reachable.
 */
export default async function globalSetup(): Promise<void> {
  if (!existsSync(envPath)) {
    throw new Error(
      "Missing tests/e2e/.env — copy tests/e2e/.env.example to tests/e2e/.env and adjust values.",
    );
  }

  dotenv.config({ path: envPath });

  validateE2eEnv(process.env);

  if (process.env.E2E_SKIP === "1") {
    return;
  }

  const baseUrl = process.env.E2E_BASE_URL;
  const apiUrl = process.env.E2E_API_URL;

  if (!baseUrl || !apiUrl) {
    throw new Error("E2E_BASE_URL and E2E_API_URL must be set in tests/e2e/.env");
  }

  const apiOrigin = apiUrl.replace(/\/api\/?$/, "");

  await assertReachable(
    `${apiOrigin}/api/health`,
    "API not reachable — start the API (npm run dev:api or npm run dev).",
  );

  await assertReachable(
    `${baseUrl.replace(/\/$/, "")}/login`,
    "Web app not reachable — start the web dev server (npm run dev:web or npm run dev).",
  );

  // Optional hard fail when agent QA E2E must run (planner tool calling required).
  await validateAgentQaToolSupport(process.env);
}

/**
 * @param url - URL to probe.
 * @param message - Error shown when the request fails.
 */
async function assertReachable(url: string, message: string): Promise<void> {
  try {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) {
      throw new Error(`${res.status} ${res.statusText}`);
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`${message} (${detail})`);
  }
}
