#!/usr/bin/env node
// Runs related tests only for staged changes (no coverage gate).
//
// Usage:
//   node scripts/test-staged.mjs
import { join, relative } from "node:path";
import {
  getStagedFiles,
  hasRagCodeChanges,
  REPO_ROOT,
  resolvePythonTestsForStaged,
  spawnCommand,
  TS_FILE,
  WORKSPACES,
  workspacesToTest,
} from "./lib/staged-files.mjs";

const stagedFiles = getStagedFiles();
const ragRoot = join(REPO_ROOT, "apps/rag");

/**
 * Runs vitest related for staged TS files in a workspace.
 * @param {typeof WORKSPACES[number]} entry
 * @param {string[]} repoRelativeFiles paths under this workspace or shared-types for dependents
 * @returns {number}
 */
function runVitestRelated(entry, repoRelativeFiles) {
  const workspaceRoot = join(REPO_ROOT, entry.cwd);
  const relatedPaths = repoRelativeFiles.map((file) => {
    if (file.startsWith(entry.prefix)) {
      return file.slice(entry.prefix.length);
    }

    return relative(workspaceRoot, join(REPO_ROOT, file)).replace(/\\/g, "/");
  });

  console.log(
    `test (staged): ${entry.workspace} vitest related (${relatedPaths.length} file(s))`,
  );
  return spawnCommand(
    "npx",
    ["vitest", "related", "--run", ...relatedPaths],
    { cwd: workspaceRoot },
  );
}

const testWorkspaces = workspacesToTest(stagedFiles);
const sharedTypesEntry = WORKSPACES.find(
  (entry) => entry.workspace === "@codesage/shared-types",
);
const sharedTypesStaged = sharedTypesEntry
  ? stagedFiles.filter(
      (file) => file.startsWith(sharedTypesEntry.prefix) && TS_FILE.test(file),
    )
  : [];

for (const entry of testWorkspaces) {
  const ownFiles = stagedFiles.filter(
    (file) => file.startsWith(entry.prefix) && TS_FILE.test(file),
  );

  /** @type {string[]} */
  let relatedFiles = [...ownFiles];

  if (
    entry.workspace !== "@codesage/shared-types" &&
    sharedTypesStaged.length > 0
  ) {
    relatedFiles = [...relatedFiles, ...sharedTypesStaged];
  }

  if (relatedFiles.length === 0) {
    continue;
  }

  const status = runVitestRelated(entry, relatedFiles);
  if (status !== 0) {
    process.exit(status);
  }
}

if (hasRagCodeChanges(stagedFiles)) {
  const pytestTargets = resolvePythonTestsForStaged(stagedFiles, ragRoot);

  if (pytestTargets.length === 0) {
    console.log("test (staged): apps/rag — no pytest targets resolved, skipping");
    process.exit(0);
  }

  console.log(
    `test (staged): apps/rag pytest (${pytestTargets.length} file(s))`,
  );
  const status = spawnCommand(
    "uv",
    ["run", "pytest", ...pytestTargets, "--no-cov"],
    { cwd: ragRoot },
  );

  if (status !== 0) {
    process.exit(status);
  }
}
