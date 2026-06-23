import { describe, it, expect, vi } from "vitest";
import { appendAuditLog, AUDIT_ACTIONS } from "./audit";
import type { Sql } from "./db";

/** Builds a tagged-template-compatible mock that returns the provided rows. */
function makeMockSql(rows: unknown[]): Sql {
  return Object.assign(vi.fn().mockResolvedValue(rows), {
    end: vi.fn(),
    json: (v: unknown) => v,
  }) as unknown as Sql;
}

describe("appendAuditLog", () => {
  it("inserts an audit row and returns its id", async () => {
    const db = makeMockSql([{ id: "audit-1" }]);
    const id = await appendAuditLog(db, "actor-1", AUDIT_ACTIONS.USER_CREATE, "user-2");
    expect(id).toBe("audit-1");
    expect(db).toHaveBeenCalledOnce();
  });

  it("allows a null target when target is omitted", async () => {
    const db = makeMockSql([{ id: "audit-2" }]);
    await appendAuditLog(db, "actor-1", AUDIT_ACTIONS.PROJECT_DELETE);
    expect(db).toHaveBeenCalledOnce();
  });

  it("throws when the INSERT returns an empty result set", async () => {
    const db = makeMockSql([]);
    await expect(
      appendAuditLog(db, "actor-1", AUDIT_ACTIONS.REPO_ATTACH, "repo-1"),
    ).rejects.toThrow("Unexpected empty result");
  });
});
