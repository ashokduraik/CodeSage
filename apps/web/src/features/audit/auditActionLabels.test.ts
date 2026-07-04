import { describe, it, expect } from "vitest";
import { auditActionLabelKey, AUDIT_ACTIONS } from "./auditActionLabels";

describe("auditActionLabelKey", () => {
  it("maps dotted actions to underscore i18n keys", () => {
    expect(auditActionLabelKey("repo.attach")).toBe("audit.actions.repo_attach");
  });

  it("covers every known action", () => {
    for (const action of AUDIT_ACTIONS) {
      expect(auditActionLabelKey(action)).toMatch(/^audit\.actions\./);
    }
  });
});
