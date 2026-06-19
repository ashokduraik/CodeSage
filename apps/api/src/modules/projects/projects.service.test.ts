import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("./projects.repository", () => ({
  findAllProjects: vi.fn(),
  findProjectById: vi.fn(),
  insertProject: vi.fn(),
  deleteProject: vi.fn(),
}));

const { listProjects, getProject, createProject, removeProject } = await import("./projects.service");
import { findAllProjects, findProjectById, insertProject, deleteProject } from "./projects.repository";
import type { Sql } from "../../platform/db";

const mockList = vi.mocked(findAllProjects);
const mockFind = vi.mocked(findProjectById);
const mockInsert = vi.mocked(insertProject);
const mockDelete = vi.mocked(deleteProject);

const DB = {} as Sql;

afterEach(() => vi.clearAllMocks());

const ROW = {
  id: "p1",
  name: "Acme",
  status: "active",
  repo_count: 0,
  created_at: new Date("2026-01-01T00:00:00Z"),
};

describe("listProjects", () => {
  it("returns mapped project responses", async () => {
    mockList.mockResolvedValue([ROW]);
    const result = await listProjects(DB);
    expect(result).toEqual([{ id: "p1", name: "Acme", status: "active", repoCount: 0, createdAt: "2026-01-01T00:00:00.000Z" }]);
  });

  it("returns empty array when there are no projects", async () => {
    mockList.mockResolvedValue([]);
    expect(await listProjects(DB)).toEqual([]);
  });
});

describe("getProject", () => {
  it("returns the project response when found", async () => {
    mockFind.mockResolvedValue(ROW);
    const result = await getProject(DB, "p1");
    expect(result.id).toBe("p1");
  });

  it("throws 404 when not found", async () => {
    mockFind.mockResolvedValue(undefined);
    await expect(getProject(DB, "missing")).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("createProject", () => {
  it("creates and returns the project", async () => {
    mockInsert.mockResolvedValue(ROW);
    const result = await createProject(DB, "Acme");
    expect(result.name).toBe("Acme");
  });

  it("throws 400 when name is blank", async () => {
    await expect(createProject(DB, "   ")).rejects.toMatchObject({
      statusCode: 400,
      code: "VALIDATION_ERROR",
    });
  });
});

describe("removeProject", () => {
  it("resolves without error when the project is deleted", async () => {
    mockDelete.mockResolvedValue(true);
    await expect(removeProject(DB, "p1")).resolves.toBeUndefined();
  });

  it("throws 404 when the project does not exist", async () => {
    mockDelete.mockResolvedValue(false);
    await expect(removeProject(DB, "missing")).rejects.toMatchObject({ statusCode: 404 });
  });
});
