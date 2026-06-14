import { describe, it, expect, vi } from "vitest";
import {
  findAllProjects,
  findProjectById,
  insertProject,
  deleteProject,
} from "./projects.repository";
import type { Sql } from "../../platform/db";

function makeMockSql(rows: unknown[]): Sql {
  return Object.assign(vi.fn().mockResolvedValue(rows), {
    end: vi.fn(),
    json: (v: unknown) => v,
  }) as unknown as Sql;
}

const MOCK_ROW = { id: "p1", name: "My Project", status: "active", created_at: new Date() };

describe("findAllProjects", () => {
  it("returns an array of project rows", async () => {
    const db = makeMockSql([MOCK_ROW]);
    const rows = await findAllProjects(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("p1");
  });

  it("returns an empty array when there are no projects", async () => {
    const db = makeMockSql([]);
    expect(await findAllProjects(db)).toEqual([]);
  });
});

describe("findProjectById", () => {
  it("returns the project row when found", async () => {
    const db = makeMockSql([MOCK_ROW]);
    expect(await findProjectById(db, "p1")).toEqual(MOCK_ROW);
  });

  it("returns undefined when not found", async () => {
    const db = makeMockSql([]);
    expect(await findProjectById(db, "missing")).toBeUndefined();
  });
});

describe("insertProject", () => {
  it("returns the created row", async () => {
    const db = makeMockSql([MOCK_ROW]);
    expect(await insertProject(db, "My Project")).toEqual(MOCK_ROW);
  });

  it("throws when INSERT returns no rows", async () => {
    const db = makeMockSql([]);
    await expect(insertProject(db, "fail")).rejects.toThrow("Unexpected empty result");
  });
});

describe("deleteProject", () => {
  it("returns true when a row was deleted", async () => {
    const db = makeMockSql([{ id: "p1" }]);
    expect(await deleteProject(db, "p1")).toBe(true);
  });

  it("returns false when no row matched", async () => {
    const db = makeMockSql([]);
    expect(await deleteProject(db, "missing")).toBe(false);
  });
});
