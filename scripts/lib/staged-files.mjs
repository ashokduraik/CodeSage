import { spawnSync } from "node:child_process";
import { dirname, join, relative, resolve } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Repository root (monorepo). */
export const REPO_ROOT = resolve(__dirname, "../..");

/** @type {{ prefix: string, workspace: string, cwd: string, dependents?: string[] }[]} */
export const WORKSPACES = [
  {
    prefix: "packages/shared-types/",
    workspace: "@codesage/shared-types",
    cwd: "packages/shared-types",
    dependents: ["@codesage/api", "@codesage/web"],
  },
  {
    prefix: "apps/api/",
    workspace: "@codesage/api",
    cwd: "apps/api",
  },
  {
    prefix: "apps/web/",
    workspace: "@codesage/web",
    cwd: "apps/web",
  },
];

export const TS_FILE = /\.tsx?$/;
export const LINTABLE_FILE = /\.(tsx?|jsx?|mjs|cjs)$/;

export const RAG_PREFIX = "apps/rag/";
export const RAG_SRC_PREFIX = "apps/rag/src/";
export const RAG_TESTS_PREFIX = "apps/rag/tests/";

/**
 * Returns staged file paths relative to the repo root.
 * @param {string} [cwd]
 * @returns {string[]}
 */
export function getStagedFiles(cwd = REPO_ROOT) {
  const result = spawnSync(
    "git",
    ["diff", "--cached", "--name-only", "--diff-filter=ACMR"],
    { cwd, encoding: "utf8" },
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
 * Finds the workspace entry matching a repo-relative staged path.
 * @param {string} file
 * @returns {typeof WORKSPACES[number] | undefined}
 */
export function findWorkspaceForFile(file) {
  return WORKSPACES.find((entry) => file.startsWith(entry.prefix));
}

/**
 * Groups staged paths by npm workspace for files matching an extension regex.
 * @param {string[]} stagedFiles
 * @param {RegExp} extensionRegex
 * @returns {{ entry: typeof WORKSPACES[number], files: string[] }[]}
 */
export function groupStagedByWorkspace(stagedFiles, extensionRegex) {
  /** @type {Map<string, { entry: typeof WORKSPACES[number], files: string[] }>} */
  const grouped = new Map();

  for (const file of stagedFiles) {
    if (!extensionRegex.test(file)) {
      continue;
    }

    const entry = findWorkspaceForFile(file);
    if (!entry) {
      continue;
    }

    const existing = grouped.get(entry.workspace);
    if (existing) {
      existing.files.push(file);
    } else {
      grouped.set(entry.workspace, { entry, files: [file] });
    }
  }

  return [...grouped.values()];
}

/**
 * Resolves which npm workspaces need a full typecheck for the given staged paths.
 * @param {string[]} stagedFiles
 * @returns {string[]}
 */
export function workspacesToTypecheck(stagedFiles) {
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
 * Resolves colocated vitest files for staged TS paths within one workspace.
 * Only runs tests that mirror staged source/test files — no import-graph expansion.
 * @param {string[]} stagedFiles repo-relative staged paths
 * @param {typeof WORKSPACES[number]} entry
 * @param {string} [workspaceRoot]
 * @returns {string[]} test paths relative to the workspace directory
 */
export function resolveJsTestFilesForStaged(
  stagedFiles,
  entry,
  workspaceRoot = join(REPO_ROOT, entry.cwd),
) {
  /** @type {Set<string>} */
  const tests = new Set();

  for (const file of stagedFiles) {
    if (!file.startsWith(entry.prefix) || !TS_FILE.test(file)) {
      continue;
    }

    const rel = file.slice(entry.prefix.length);

    if (/\.test\.(ts|tsx)$/.test(rel)) {
      tests.add(rel);
      continue;
    }

    if (!/\.tsx?$/.test(rel)) {
      continue;
    }

    const stem = rel.replace(/\.tsx?$/, "");
    for (const suffix of [".test.ts", ".test.tsx"]) {
      const candidate = `${stem}${suffix}`;
      if (existsSync(join(workspaceRoot, candidate))) {
        tests.add(candidate);
      }
    }
  }

  return [...tests].sort();
}

/**
 * Converts repo-relative paths to paths relative to a workspace directory.
 * @param {string} workspacePrefix
 * @param {string[]} repoRelativeFiles
 * @returns {string[]}
 */
export function toWorkspaceRelativePaths(workspacePrefix, repoRelativeFiles) {
  return repoRelativeFiles.map((file) => file.slice(workspacePrefix.length));
}

/**
 * Runs npm with Windows-safe shell handling.
 * @param {string[]} args
 * @param {{ cwd?: string, stdio?: "inherit" | "pipe" }} [options]
 * @returns {number}
 */
export function spawnNpm(args, options = {}) {
  const result = spawnSync("npm", args, {
    cwd: options.cwd ?? REPO_ROOT,
    stdio: options.stdio ?? "inherit",
    shell: process.platform === "win32",
  });
  return result.status ?? 1;
}

/**
 * Runs an arbitrary command with Windows-safe shell handling.
 * @param {string} command
 * @param {string[]} args
 * @param {{ cwd?: string, stdio?: "inherit" | "pipe" }} [options]
 * @returns {number}
 */
export function spawnCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? REPO_ROOT,
    stdio: options.stdio ?? "inherit",
    shell: process.platform === "win32",
  });
  return result.status ?? 1;
}

/**
 * Re-stages files after auto-fix so fixes are included in the commit.
 * @param {string[]} repoRelativeFiles
 * @returns {number}
 */
export function restageFiles(repoRelativeFiles) {
  if (repoRelativeFiles.length === 0) {
    return 0;
  }

  return spawnCommand("git", ["add", "--", ...repoRelativeFiles], {
    cwd: REPO_ROOT,
    stdio: "pipe",
  });
}

/**
 * Builds candidate pytest paths (relative to apps/rag) for a staged source file.
 * @param {string} stagedSourcePath repo-relative path under apps/rag/src/
 * @returns {string[]}
 */
export function resolvePythonTestCandidates(stagedSourcePath) {
  if (!stagedSourcePath.startsWith(RAG_SRC_PREFIX)) {
    return [];
  }

  const rel = stagedSourcePath.slice(RAG_SRC_PREFIX.length);
  const parts = rel.split("/");
  const fileName = parts.at(-1) ?? "";
  const moduleStem = fileName.replace(/\.py$/, "");
  const parentDir = parts.length >= 2 ? parts.at(-2) : "";
  const area = parts[0] ?? "";

  /** @type {string[]} */
  const candidates = [];

  if (parts.length >= 2) {
    const dirParts = parts.slice(0, -1);
    candidates.push(
      join("tests", ...dirParts, `test_${moduleStem}.py`).replace(/\\/g, "/"),
    );
  }

  if (area && moduleStem) {
    candidates.push(`tests/${area}/test_${moduleStem}.py`);
  }

  if (area && parentDir && moduleStem) {
    candidates.push(`tests/${area}/test_${parentDir}_${moduleStem}.py`);
  }

  if (area && parentDir) {
    candidates.push(`tests/${area}/test_${parentDir}.py`);
  }

  return [...new Set(candidates)];
}

/**
 * Resolves pytest targets (paths relative to apps/rag) for staged RAG paths.
 * @param {string[]} stagedFiles repo-relative staged paths
 * @param {string} [ragRoot]
 * @returns {string[]}
 */
export function resolvePythonTestsForStaged(stagedFiles, ragRoot = join(REPO_ROOT, "apps/rag")) {
  /** @type {Set<string>} */
  const targets = new Set();

  for (const file of stagedFiles) {
    if (file.startsWith(RAG_TESTS_PREFIX) && file.endsWith(".py")) {
      targets.add(relative(ragRoot, join(REPO_ROOT, file)).replace(/\\/g, "/"));
      continue;
    }

    if (!file.startsWith(RAG_SRC_PREFIX) || !file.endsWith(".py")) {
      continue;
    }

    const candidates = resolvePythonTestCandidates(file);
    const existing = candidates.filter((candidate) =>
      existsSync(join(ragRoot, candidate)),
    );

    for (const candidate of existing) {
      targets.add(candidate);
    }
  }

  return [...targets].sort();
}

/**
 * Returns true when staged files touch apps/rag source or tests.
 * @param {string[]} stagedFiles
 * @returns {boolean}
 */
export function hasRagCodeChanges(stagedFiles) {
  return stagedFiles.some(
    (file) =>
      (file.startsWith(RAG_SRC_PREFIX) || file.startsWith(RAG_TESTS_PREFIX)) &&
      file.endsWith(".py"),
  );
}

/**
 * Returns true when staged files touch contracts/.
 * @param {string[]} stagedFiles
 * @returns {boolean}
 */
export function hasContractChanges(stagedFiles) {
  return stagedFiles.some((file) => file.startsWith("contracts/"));
}
