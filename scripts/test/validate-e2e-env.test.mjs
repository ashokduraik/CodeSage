import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  e2eEngineUrl,
  isAgentQaRequired,
  missingRequiredE2eEnv,
  validateAgentQaToolSupport,
  validateE2eEnv,
} from "../../tests/e2e/helpers/validate-e2e-env.ts";

describe("validateE2eEnv", () => {
  it("returns no missing keys when private url and token are set", () => {
    const missing = missingRequiredE2eEnv({
      E2E_PRIVATE_REPO_URL: "https://github.com/org/private.git",
      E2E_GITHUB_TOKEN: "ghp_test",
    });
    assert.deepEqual(missing, []);
  });

  it("lists missing private url and token", () => {
    const missing = missingRequiredE2eEnv({});
    assert.deepEqual(missing, ["E2E_PRIVATE_REPO_URL", "E2E_GITHUB_TOKEN"]);
  });

  it("skips validation when E2E_SKIP is set", () => {
    assert.deepEqual(missingRequiredE2eEnv({ E2E_SKIP: "1" }), []);
    assert.doesNotThrow(() => validateE2eEnv({ E2E_SKIP: "1" }));
  });

  it("throws when required env is incomplete", () => {
    assert.throws(() => validateE2eEnv({}), /E2E env incomplete/);
  });

  it("treats E2E_AGENT_QA_REQUIRED=1 as required agent QA", () => {
    assert.equal(isAgentQaRequired({ E2E_AGENT_QA_REQUIRED: "1" }), true);
    assert.equal(isAgentQaRequired({}), false);
  });

  it("defaults engine URL when E2E_ENGINE_URL is unset", () => {
    assert.equal(e2eEngineUrl({}), "http://127.0.0.1:8001");
    assert.equal(
      e2eEngineUrl({ E2E_ENGINE_URL: "http://localhost:9001/" }),
      "http://localhost:9001/",
    );
  });

  it("skips agent QA tool check when not required", async () => {
    await assert.doesNotReject(() => validateAgentQaToolSupport({}));
  });

  it("skips agent QA tool check when E2E_SKIP is set", async () => {
    await assert.doesNotReject(() =>
      validateAgentQaToolSupport({ E2E_SKIP: "1", E2E_AGENT_QA_REQUIRED: "1" }),
    );
  });
});
