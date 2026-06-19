import { describe, it, expect, vi, afterEach } from "vitest";
import { getProjectCounts } from "./dashboard.repository";
import type { Sql } from "../../platform/db";

afterEach(() => vi.clearAllMocks());

/** Creates a minimal postgres.js-style tagged-template mock. */
function mockDb(result: unknown[]) {
  const sql = vi.fn().mockResolvedValue(result) as unknown as Sql;
  return sql;
}

describe("getProjectCounts", () => {
  it("returns project counts from the database", async () => {
    const db = mockDb([{ total: 5, indexed: 3 }]);
    const counts = await getProjectCounts(db);
    expect(counts.projectCount).toBe(5);
    expect(counts.indexedProjectCount).toBe(3);
  });

  it("returns zeros when the table is empty", async () => {
    const db = mockDb([{ total: 0, indexed: 0 }]);
    const counts = await getProjectCounts(db);
    expect(counts.projectCount).toBe(0);
    expect(counts.indexedProjectCount).toBe(0);
  });

  it("handles a missing row gracefully (returns zeros)", async () => {
    const db = mockDb([]);
    const counts = await getProjectCounts(db);
    expect(counts.projectCount).toBe(0);
    expect(counts.indexedProjectCount).toBe(0);
  });
});
