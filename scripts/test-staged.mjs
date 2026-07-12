#!/usr/bin/env node
// Runs colocated / directly staged tests only (no coverage gate).
//
// Usage:
//   node scripts/test-staged.mjs
import { join } from "node:path";
import {
  getStagedFiles,
  groupStagedByWorkspace,
  hasEngineCodeChanges,
  REPO_ROOT,
  resolveJsTestFilesForStaged,
  resolvePythonTestsForStaged,
  spawnCommand,
  TS_FILE,
} from "./lib/staged-files.mjs";

const stagedFiles = getStagedFiles();
const engineRoot = join(REPO_ROOT, "apps/engine");

/**
 * Runs vitest on explicit test files for a workspace.
 * @param {import("./lib/staged-files.mjs").WORKSPACES[number]} entry
 * @param {string[]} workspaceRelativeTests paths relative to workspace cwd
 * @returns {number}
 */
function runVitestFiles(entry, workspaceRelativeTests) {
  const workspaceRoot = join(REPO_ROOT, entry.cwd);

  console.log(
    `test (staged): ${entry.workspace} vitest run (${workspaceRelativeTests.length} file(s))`,
  );
  return spawnCommand(
    "npx",
    ["vitest", "run", "--passWithNoTests", ...workspaceRelativeTests],
    { cwd: workspaceRoot },
  );
}

const jsGroups = groupStagedByWorkspace(stagedFiles, TS_FILE);

for (const { entry, files } of jsGroups) {
  const testFiles = resolveJsTestFilesForStaged(files, entry);

  if (testFiles.length === 0) {
    console.log(
      `test (staged): ${entry.workspace} — no colocated tests for staged files, skipping`,
    );
    continue;
  }

  const status = runVitestFiles(entry, testFiles);
  if (status !== 0) {
    process.exit(status);
  }
}

if (hasEngineCodeChanges(stagedFiles)) {
  const pytestTargets = resolvePythonTestsForStaged(stagedFiles, engineRoot);

  if (pytestTargets.length === 0) {
    console.log("test (staged): apps/engine — no pytest targets resolved, skipping");
    process.exit(0);
  }

  console.log(
    `test (staged): apps/engine pytest (${pytestTargets.length} file(s))`,
  );
  const status = spawnCommand(
    "uv",
    ["run", "pytest", ...pytestTargets, "--no-cov"],
    { cwd: engineRoot },
  );

  if (status !== 0) {
    process.exit(status);
  }
}
