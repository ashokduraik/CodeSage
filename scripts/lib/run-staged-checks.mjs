import { join } from "node:path";
import {
  getStagedFiles,
  groupStagedByWorkspace,
  hasContractChanges,
  hasEngineCodeChanges,
  LINTABLE_FILE,
  REPO_ROOT,
  resolveJsTestFilesForStaged,
  resolvePythonTestsForStaged,
  restageFiles,
  spawnCommand,
  spawnNpm,
  TS_FILE,
  workspacesToTypecheck,
} from "./staged-files.mjs";

/**
 * Runs ESLint --fix on staged lintable files per workspace, then re-stages fixes.
 * @param {string[]} stagedFiles
 * @returns {number} process exit code
 */
export function runLintStaged(stagedFiles) {
  const groups = groupStagedByWorkspace(stagedFiles, LINTABLE_FILE);

  if (groups.length === 0) {
    console.log("lint (staged): no lintable JS/TS files, skipping");
    return 0;
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
      return status;
    }

    restageFiles(files);
  }

  return 0;
}

/**
 * Runs codegen:check when contracts change, then workspace typecheck for touched TS.
 * @param {string[]} stagedFiles
 * @returns {number} process exit code
 */
export function runTypecheckStaged(stagedFiles) {
  if (hasContractChanges(stagedFiles)) {
    console.log("codegen:check (staged): contracts/");
    const codegenStatus = spawnNpm(["run", "codegen:check"]);
    if (codegenStatus !== 0) {
      return codegenStatus;
    }
  } else {
    console.log("codegen:check (staged): no contracts/ changes, skipping");
  }

  const workspaces = workspacesToTypecheck(stagedFiles);

  if (workspaces.length === 0) {
    console.log("typecheck (staged): no staged TypeScript files, skipping");
    return 0;
  }

  for (const workspace of workspaces) {
    console.log(`typecheck (staged): ${workspace}`);
    const status = spawnNpm(["run", "typecheck", "-w", workspace]);
    if (status !== 0) {
      return status;
    }
  }

  return 0;
}

/**
 * Runs vitest on colocated staged JS tests and/or pytest on related engine tests.
 * @param {string[]} stagedFiles
 * @returns {number} process exit code
 */
export function runTestStaged(stagedFiles) {
  const engineRoot = join(REPO_ROOT, "apps/engine");
  const jsGroups = groupStagedByWorkspace(stagedFiles, TS_FILE);
  let ranAnything = false;

  for (const { entry, files } of jsGroups) {
    const testFiles = resolveJsTestFilesForStaged(files, entry);

    if (testFiles.length === 0) {
      console.log(
        `test (staged): ${entry.workspace} — no colocated tests for staged files, skipping`,
      );
      continue;
    }

    ranAnything = true;
    console.log(
      `test (staged): ${entry.workspace} vitest run (${testFiles.length} file(s))`,
    );
    const status = spawnCommand(
      "npx",
      ["vitest", "run", "--passWithNoTests", ...testFiles],
      { cwd: join(REPO_ROOT, entry.cwd) },
    );
    if (status !== 0) {
      return status;
    }
  }

  if (jsGroups.length === 0) {
    console.log("test (staged): no staged TypeScript files, skipping vitest");
  }

  if (hasEngineCodeChanges(stagedFiles)) {
    const pytestTargets = resolvePythonTestsForStaged(stagedFiles, engineRoot);

    if (pytestTargets.length === 0) {
      console.log("test (staged): apps/engine — no pytest targets resolved, skipping");
      return 0;
    }

    ranAnything = true;
    console.log(
      `test (staged): apps/engine pytest (${pytestTargets.length} file(s))`,
    );
    const status = spawnCommand(
      "uv",
      ["run", "pytest", ...pytestTargets, "--no-cov"],
      { cwd: engineRoot },
    );
    if (status !== 0) {
      return status;
    }
  }

  if (!ranAnything) {
    console.log("test (staged): nothing to run, skipping");
  }

  return 0;
}

/**
 * Returns whether any staged path can trigger a JS/TS or contracts check.
 * @param {string[]} stagedFiles
 * @returns {{ needsLint: boolean, needsTypecheck: boolean, needsJsTest: boolean, needsPyTest: boolean, needsCodegen: boolean }}
 */
export function classifyStagedChecks(stagedFiles) {
  const needsLint = groupStagedByWorkspace(stagedFiles, LINTABLE_FILE).length > 0;
  const needsCodegen = hasContractChanges(stagedFiles);
  const needsTypecheck =
    needsCodegen || workspacesToTypecheck(stagedFiles).length > 0;
  const needsJsTest = groupStagedByWorkspace(stagedFiles, TS_FILE).length > 0;
  const needsPyTest = hasEngineCodeChanges(stagedFiles);

  return { needsLint, needsTypecheck, needsJsTest, needsPyTest, needsCodegen };
}

/**
 * Runs the full pre-commit gate once: lint → typecheck/codegen → tests.
 * Skips JS/codegen when staged files do not touch them.
 * @param {string[]} [stagedFiles]
 * @returns {number} process exit code
 */
export function runPreCommit(stagedFiles = getStagedFiles()) {
  const plan = classifyStagedChecks(stagedFiles);

  if (
    !plan.needsLint &&
    !plan.needsTypecheck &&
    !plan.needsJsTest &&
    !plan.needsPyTest
  ) {
    console.log(
      "pre-commit: staged files need no lint/typecheck/test — skipping all checks",
    );
    return 0;
  }

  if (!plan.needsLint) {
    console.log("pre-commit: skipping JS lint (no staged JS/TS in workspaces)");
  } else {
    const lintStatus = runLintStaged(stagedFiles);
    if (lintStatus !== 0) {
      return lintStatus;
    }
  }

  if (!plan.needsTypecheck) {
    console.log(
      "pre-commit: skipping typecheck + codegen (no staged TS or contracts/)",
    );
  } else {
    const typecheckStatus = runTypecheckStaged(stagedFiles);
    if (typecheckStatus !== 0) {
      return typecheckStatus;
    }
  }

  if (!plan.needsJsTest && !plan.needsPyTest) {
    console.log("pre-commit: skipping tests (no staged TS or engine Python)");
    return 0;
  }

  return runTestStaged(stagedFiles);
}
