import { describe, it, expect, vi } from "vitest";
import {
  findReposByProject,
  findRepoById,
  insertRepo,
  deleteRepo,
} from "./repos.repository";
import type { Sql } from "../../platform/db";

function makeMockSql(rows: unknown[]): Sql {
  return Object.assign(vi.fn().mockResolvedValue(rows), {
    end: vi.fn(),
    json: (v: unknown) => v,
  }) as unknown as Sql;
}

const MOCK_ROW = {
  id: "r1",
  project_id: "p1",
  repo_url: "https://github.com/org/repo",
  provider: "github",
  branch: "main",
  role: "backend",
  last_indexed_sha: null,
  created_at: new Date(),
};

describe("findReposByProject", () => {
  it("returns repos for the project", async () => {
    const db = makeMockSql([MOCK_ROW]);
    expect(await findReposByProject(db, "p1")).toHaveLength(1);
  });

  it("returns empty array when no repos exist", async () => {
    const db = makeMockSql([]);
    expect(await findReposByProject(db, "p1")).toEqual([]);
  });
});

describe("findRepoById", () => {
  it("returns the repo when found", async () => {
    const db = makeMockSql([MOCK_ROW]);
    expect(await findRepoById(db, "p1", "r1")).toEqual(MOCK_ROW);
  });

  it("returns undefined when not found", async () => {
    const db = makeMockSql([]);
    expect(await findRepoById(db, "p1", "missing")).toBeUndefined();
  });
});

describe("insertRepo", () => {
  it("returns the created row (no token)", async () => {
    const db = makeMockSql([MOCK_ROW]);
    const result = await insertRepo(db, "p1", "https://github.com/o/r", "github", "main", "backend", null);
    expect(result.id).toBe("r1");
  });

  it("returns the created row (with encrypted token)", async () => {
    const db = makeMockSql([MOCK_ROW]);
    const result = await insertRepo(db, "p1", "https://github.com/o/r", "github", "main", "backend", "enc-token");
    expect(result.id).toBe("r1");
  });

  it("throws when INSERT returns no rows", async () => {
    const db = makeMockSql([]);
    await expect(
      insertRepo(db, "p1", "https://github.com/o/r", "github", "main", "backend", null),
    ).rejects.toThrow("Unexpected empty result");
  });
});

describe("deleteRepo", () => {
  it("returns true when a row was deleted", async () => {
    const db = makeMockSql([{ id: "r1" }]);
    expect(await deleteRepo(db, "p1", "r1")).toBe(true);
  });

  it("returns false when no row matched", async () => {
    const db = makeMockSql([]);
    expect(await deleteRepo(db, "p1", "missing")).toBe(false);
  });
});
