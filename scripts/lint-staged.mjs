#!/usr/bin/env node
// Runs ESLint with --fix only on staged files per npm workspace.
//
// Usage:
//   node scripts/lint-staged.mjs
import { join } from "node:path";
import {
  groupStagedByWorkspace,
  getStagedFiles,
  LINTABLE_FILE,
  REPO_ROOT,
  restageFiles,
  spawnCommand,
} from "./lib/staged-files.mjs";

const stagedFiles = getStagedFiles();
const groups = groupStagedByWorkspace(stagedFiles, LINTABLE_FILE);

if (groups.length === 0) {
  process.exit(0);
}

for (const { entry, files } of groups) {
  const workspaceRoot = join(REPO_ROOT, entry.cwd);
  const relativeFiles = files.map((file) => file.slice(entry.prefix.length));

  console.log(`lint (staged): ${entry.workspace} (${relativeFiles.length} file(s))`);
  const status = spawnCommand(
    "npx",
    ["eslint", "--max-warnings=0", "--no-warn-ignored", "--fix", ...relativeFiles],
    { cwd: workspaceRoot },
  );

  if (status !== 0) {
    process.exit(status);
  }

  restageFiles(files);
}
