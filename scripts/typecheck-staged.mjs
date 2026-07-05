#!/usr/bin/env node
// Runs workspace typecheck only when staged files touch that workspace.
//
// Usage:
//   node scripts/typecheck-staged.mjs
import {
  getStagedFiles,
  hasContractChanges,
  spawnNpm,
  workspacesToTypecheck,
} from "./lib/staged-files.mjs";

/**
 * Runs `npm run typecheck` for a single workspace.
 * @param {string} workspace
 * @returns {number} process exit code
 */
function runWorkspaceTypecheck(workspace) {
  console.log(`typecheck (staged): ${workspace}`);
  return spawnNpm(["run", "typecheck", "-w", workspace]);
}

const stagedFiles = getStagedFiles();

if (hasContractChanges(stagedFiles)) {
  console.log("codegen:check (staged): contracts/");
  const codegenStatus = spawnNpm(["run", "codegen:check"]);
  if (codegenStatus !== 0) {
    process.exit(codegenStatus);
  }
}

const workspaces = workspacesToTypecheck(stagedFiles);

if (workspaces.length === 0) {
  process.exit(0);
}

for (const workspace of workspaces) {
  const status = runWorkspaceTypecheck(workspace);
  if (status !== 0) {
    process.exit(status);
  }
}
