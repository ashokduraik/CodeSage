#!/usr/bin/env node
// Runs workspace typecheck only when staged files touch that workspace.
//
// Usage:
//   node scripts/typecheck-staged.mjs
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

/** @type {{ prefix: string, workspace: string, dependents?: string[] }[]} */
const WORKSPACES = [
  {
    prefix: "packages/shared-types/",
    workspace: "@codesage/shared-types",
    dependents: ["@codesage/api", "@codesage/web"],
  },
  { prefix: "apps/api/", workspace: "@codesage/api" },
  { prefix: "apps/web/", workspace: "@codesage/web" },
];

const TS_FILE = /\.tsx?$/;

/**
 * Returns staged file paths relative to the repo root.
 * @returns {string[]}
 */
function getStagedFiles() {
  const result = spawnSync(
    "git",
    ["diff", "--cached", "--name-only", "--diff-filter=ACMR"],
    { cwd: root, encoding: "utf8" },
  );

  if (result.status !== 0) {
    console.error(result.stderr || "Failed to read staged files.");
    process.exit(result.status ?? 1);
  }

  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Resolves which npm workspaces need a full typecheck for the given staged paths.
 * @param {string[]} stagedFiles
 * @returns {string[]}
 */
function workspacesToTypecheck(stagedFiles) {
  /** @type {Set<string>} */
  const targets = new Set();

  for (const file of stagedFiles) {
    if (!TS_FILE.test(file)) {
      continue;
    }

    for (const entry of WORKSPACES) {
      if (!file.startsWith(entry.prefix)) {
        continue;
      }

      targets.add(entry.workspace);
      for (const dependent of entry.dependents ?? []) {
        targets.add(dependent);
      }
    }
  }

  return [...targets];
}

/**
 * Runs `npm run typecheck` for a single workspace.
 * @param {string} workspace
 * @returns {number} process exit code
 */
function runWorkspaceTypecheck(workspace) {
  console.log(`typecheck (staged): ${workspace}`);
  const result = spawnSync("npm", ["run", "typecheck", "-w", workspace], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  return result.status ?? 1;
}

const stagedFiles = getStagedFiles();
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
