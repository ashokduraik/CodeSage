import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  missingRequiredE2eEnv,
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
});
