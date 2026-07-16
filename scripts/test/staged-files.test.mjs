import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, it } from "node:test";
import { classifyStagedChecks } from "../lib/run-staged-checks.mjs";
import {
  groupStagedByWorkspace,
  hasContractChanges,
  hasEngineCodeChanges,
  LINTABLE_FILE,
  REPO_ROOT,
  resolveJsTestFilesForStaged,
  resolvePythonTestCandidates,
  resolvePythonTestsForStaged,
  TS_FILE,
  WORKSPACES,
  workspacesToTypecheck,
} from "../lib/staged-files.mjs";

describe("groupStagedByWorkspace", () => {
  it("groups lintable files by npm workspace", () => {
    const groups = groupStagedByWorkspace(
      [
        "apps/api/src/foo.ts",
        "apps/web/src/App.tsx",
        "apps/api/src/bar.ts",
        "README.md",
      ],
      LINTABLE_FILE,
    );

    assert.equal(groups.length, 2);
    assert.deepEqual(
      groups.find((g) => g.entry.workspace === "@codesage/api")?.files,
      ["apps/api/src/foo.ts", "apps/api/src/bar.ts"],
    );
    assert.deepEqual(
      groups.find((g) => g.entry.workspace === "@codesage/web")?.files,
      ["apps/web/src/App.tsx"],
    );
  });

  it("returns an empty list when no files match the extension", () => {
    const groups = groupStagedByWorkspace(["README.md", "docs/foo.md"], LINTABLE_FILE);
    assert.deepEqual(groups, []);
  });
});

describe("workspacesToTypecheck", () => {
  it("includes dependents when shared-types changes", () => {
    const workspaces = workspacesToTypecheck([
      "packages/shared-types/src/index.ts",
      "README.md",
    ]);

    assert.deepEqual(workspaces.sort(), [
      "@codesage/api",
      "@codesage/shared-types",
      "@codesage/web",
    ]);
  });

  it("typechecks only the touched workspace for local TS changes", () => {
    const workspaces = workspacesToTypecheck(["apps/api/src/routes.ts"]);
    assert.deepEqual(workspaces, ["@codesage/api"]);
  });
});

describe("resolveJsTestFilesForStaged", () => {
  it("resolves colocated test files for staged source", () => {
    const webEntry = WORKSPACES.find((entry) => entry.workspace === "@codesage/web");
    assert.ok(webEntry);

    const tests = resolveJsTestFilesForStaged(
      ["apps/web/src/features/projects/ProjectsPage.tsx"],
      webEntry,
    );

    assert.deepEqual(tests, ["src/features/projects/ProjectsPage.test.tsx"]);
  });

  it("runs staged test files directly", () => {
    const webEntry = WORKSPACES.find((entry) => entry.workspace === "@codesage/web");
    assert.ok(webEntry);

    const tests = resolveJsTestFilesForStaged(
      ["apps/web/src/features/chat/Chat.test.tsx"],
      webEntry,
    );

    assert.deepEqual(tests, ["src/features/chat/Chat.test.tsx"]);
  });

  it("does not expand to unrelated tests for shared UI changes", () => {
    const webEntry = WORKSPACES.find((entry) => entry.workspace === "@codesage/web");
    assert.ok(webEntry);

    const tests = resolveJsTestFilesForStaged(
      ["apps/web/src/shared/ui/dialog.tsx"],
      webEntry,
    );

    assert.deepEqual(tests, []);
  });
});

describe("hasContractChanges", () => {
  it("detects staged contract edits", () => {
    assert.equal(hasContractChanges(["contracts/openapi.node.yaml"]), true);
    assert.equal(hasContractChanges(["README.md"]), false);
  });
});

describe("hasEngineCodeChanges", () => {
  it("detects staged Python source or test files", () => {
    assert.equal(
      hasEngineCodeChanges(["apps/engine/src/services/retrieval/search.py"]),
      true,
    );
    assert.equal(
      hasEngineCodeChanges(["apps/engine/tests/services/test_retrieval.py"]),
      true,
    );
    assert.equal(hasEngineCodeChanges(["apps/engine/README.md"]), false);
  });
});

describe("resolvePythonTestCandidates", () => {
  it("builds mirror and parent-dir candidate paths", () => {
    const candidates = resolvePythonTestCandidates(
      "apps/engine/src/services/retrieval/search.py",
    );

    assert.ok(candidates.includes("tests/services/retrieval/test_search.py"));
    assert.ok(candidates.includes("tests/services/test_search.py"));
    assert.ok(candidates.includes("tests/services/test_retrieval_search.py"));
    assert.ok(candidates.includes("tests/services/test_retrieval.py"));
  });

  it("builds graph module candidates", () => {
    const candidates = resolvePythonTestCandidates(
      "apps/engine/src/services/graph/extract.py",
    );

    assert.ok(candidates.includes("tests/services/test_graph_extract.py"));
    assert.ok(candidates.includes("tests/services/test_extract.py"));
  });

  it("returns an empty list for non-RAG paths", () => {
    assert.deepEqual(resolvePythonTestCandidates("apps/api/src/index.ts"), []);
  });
});

describe("resolvePythonTestsForStaged", () => {
  const engineRoot = join(REPO_ROOT, "apps/engine");

  it("runs staged test files directly", () => {
    const targets = resolvePythonTestsForStaged(
      ["apps/engine/tests/workers/test_dispatch.py"],
      engineRoot,
    );

    assert.deepEqual(targets, ["tests/workers/test_dispatch.py"]);
  });

  it("resolves existing tests for staged source files", () => {
    const targets = resolvePythonTestsForStaged(
      ["apps/engine/src/services/retrieval/search.py"],
      engineRoot,
    );

    assert.ok(targets.includes("tests/services/test_retrieval.py"));
  });

  it("returns no targets when no matching test file exists", () => {
    const targets = resolvePythonTestsForStaged(
      ["apps/engine/src/services/nonexistent_module/foo.py"],
      engineRoot,
    );

    assert.deepEqual(targets, []);
  });
});

describe("TS_FILE", () => {
  it("matches TypeScript and TSX paths", () => {
    assert.match("apps/api/src/foo.ts", TS_FILE);
    assert.match("apps/web/src/App.tsx", TS_FILE);
    assert.doesNotMatch("apps/api/src/foo.js", TS_FILE);
  });
});

describe("classifyStagedChecks", () => {
  it("skips JS lint, typecheck, vitest, and codegen for engine-only Python", () => {
    const plan = classifyStagedChecks([
      "apps/engine/src/services/qa/stream_answer.py",
      "apps/engine/tests/services/test_stream_answer.py",
      "apps/engine/README.md",
    ]);

    assert.deepEqual(plan, {
      needsLint: false,
      needsTypecheck: false,
      needsJsTest: false,
      needsPyTest: true,
      needsCodegen: false,
    });
  });

  it("skips all checks for docs-only staged files", () => {
    const plan = classifyStagedChecks(["docs/README.md", "README.md"]);

    assert.deepEqual(plan, {
      needsLint: false,
      needsTypecheck: false,
      needsJsTest: false,
      needsPyTest: false,
      needsCodegen: false,
    });
  });

  it("requires codegen and typecheck when contracts change", () => {
    const plan = classifyStagedChecks(["contracts/openapi.engine.yaml"]);

    assert.equal(plan.needsCodegen, true);
    assert.equal(plan.needsTypecheck, true);
    assert.equal(plan.needsLint, false);
    assert.equal(plan.needsJsTest, false);
    assert.equal(plan.needsPyTest, false);
  });

  it("requires lint and JS tests when API TypeScript changes", () => {
    const plan = classifyStagedChecks(["apps/api/src/index.ts"]);

    assert.equal(plan.needsLint, true);
    assert.equal(plan.needsTypecheck, true);
    assert.equal(plan.needsJsTest, true);
    assert.equal(plan.needsCodegen, false);
    assert.equal(plan.needsPyTest, false);
  });
});
