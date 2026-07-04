import { describe, it, expect, vi } from "vitest";
import { enqueueJob } from "./queue";
import { API_SYSTEM_USER_ID } from "./serviceUsers";
import type { Sql } from "./db";

/** Builds a tagged-template-compatible mock that returns the provided rows. */
function makeMockSql(rows: unknown[]): Sql {
  const sql = Object.assign(
    vi.fn().mockResolvedValue(rows),
    {
      end: vi.fn(),
      json: (v: unknown) => v,
    },
  ) as unknown as Sql;
  return sql;
}

describe("enqueueJob", () => {
  it("inserts a job row and returns its id", async () => {
    const db = makeMockSql([{ id: "abc-123" }]);
    const id = await enqueueJob(db, "sync", { repoId: "repo-1" }, API_SYSTEM_USER_ID);
    expect(id).toBe("abc-123");
    expect(db).toHaveBeenCalledOnce();
  });

  it("passes the json-encoded payload to postgres", async () => {
    const payload = { repoId: "r1", sinceSha: "abc" };
    const db = makeMockSql([{ id: "job-1" }]);
    await enqueueJob(db, "parse", payload, API_SYSTEM_USER_ID);
    expect(db).toHaveBeenCalledOnce();
  });

  it("throws when the INSERT returns an empty result set", async () => {
    const db = makeMockSql([]);
    await expect(enqueueJob(db, "embed", { repoId: "r1", chunkIds: [] }, API_SYSTEM_USER_ID)).rejects.toThrow(
      "Unexpected empty result",
    );
  });
});
