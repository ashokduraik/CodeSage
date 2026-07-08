#!/usr/bin/env node
/**
 * Loads `tests/e2e/.env` into `process.env`.
 * Exits with a clear message when the file is missing.
 */
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

const e2eDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(e2eDir, ".env");

/**
 * @returns {string} Absolute path to the loaded `.env` file.
 */
export function loadE2eEnv() {
  if (!existsSync(envPath)) {
    console.error(
      "Missing tests/e2e/.env — copy tests/e2e/.env.example to tests/e2e/.env and adjust values.",
    );
    process.exit(1);
  }
  dotenv.config({ path: envPath });
  return envPath;
}
