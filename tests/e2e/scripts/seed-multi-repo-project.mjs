#!/usr/bin/env node
/**
 * Manual CLI: ensure the Phase 2 multi-repo E2E project exists and is indexed.
 *
 * Loads tests/e2e/.env automatically. See tests/e2e/fixtures/README.md.
 */
import process from "node:process";

import { ensureMultiRepoProject } from "./ensure-multi-repo-project.mjs";
import { loadE2eEnv } from "./load-e2e-env.mjs";

loadE2eEnv();

const result = await ensureMultiRepoProject();

if (result.skipped) {
  console.error(
    "Set E2E_FRONTEND_REPO_URL and E2E_BACKEND_REPO_URL in tests/e2e/.env (hosted Git clone URLs).",
  );
  process.exit(1);
}

console.log("Both repos indexed (xrepo should have run for multi-repo projects).");
console.log("");
console.log(`E2E_MULTI_REPO_PROJECT_ID=${result.projectId}`);
console.log(`E2E_MULTI_REPO_PROJECT_NAME="${result.projectName}"`);
console.log(`E2E_MULTI_REPO_FRONTEND_PATH=${result.frontendPath}`);
console.log(`E2E_MULTI_REPO_BACKEND_PATH=${result.backendPath}`);
