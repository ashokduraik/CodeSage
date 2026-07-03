import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("./projects.repository", () => ({
  findAllProjects: vi.fn(),
  findProjectById: vi.fn(),
  insertProject: vi.fn(),
  softDeleteProject: vi.fn(),
}));

vi.mock("../repos/repos.repository", () => ({
  findReposByProject: vi.fn(),
}));

vi.mock("../repos/repos.service", () => ({
  detachRepo: vi.fn(),
}));

const { listProjects, getProject, createProject, removeProject } = await import("./projects.service");
import {
  findAllProjects,
  findProjectById,
  insertProject,
  softDeleteProject,
} from "./projects.repository";
import { findReposByProject } from "../repos/repos.repository";
import { detachRepo } from "../repos/repos.service";
import type { Sql } from "../../platform/db";

const mockList = vi.mocked(findAllProjects);
const mockFind = vi.mocked(findProjectById);
const mockInsert = vi.mocked(insertProject);
const mockSoftDelete = vi.mocked(softDeleteProject);
const mockFindRepos = vi.mocked(findReposByProject);
const mockDetach = vi.mocked(detachRepo);

const DB = {} as Sql;

afterEach(() => vi.clearAllMocks());

const ROW = {
  id: "p1",
  name: "Acme",
  status: "active",
  repo_count: 0,
  created_at: new Date("2026-01-01T00:00:00Z"),
};

describe("removeProject", () => {
  it("detaches repos then soft-deletes the project", async () => {
    mockFind.mockResolvedValue(ROW);
    mockFindRepos.mockResolvedValue([
      {
        id: "r1",
        project_id: "p1",
        repo_url: "https://github.com/o/r",
        provider: "github",
        branch: "main",
        full_name: "o/r",
        description: null,
        base_url: null,
        is_private: false,
        connection_status: "connected",
        last_error: null,
        last_error_at: null,
        webhook_id: null,
        webhook_enabled: false,
        last_indexed_sha: null,
        last_indexed_at: null,
        primary_language: null,
        status: "A",
        created_at: new Date(),
        indexed_file_count: 0,
      },
    ]);
    mockDetach.mockResolvedValue(undefined);
    mockSoftDelete.mockResolvedValue(true);

    await removeProject(DB, "p1", "enc-key");

    expect(mockDetach).toHaveBeenCalledWith(DB, "p1", "r1", "enc-key");
    expect(mockSoftDelete).toHaveBeenCalledWith(DB, "p1");
  });

  it("throws 404 when the project does not exist", async () => {
    mockFind.mockResolvedValue(undefined);
    await expect(removeProject(DB, "missing", "")).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("listProjects", () => {
  it("returns mapped project responses", async () => {
    mockList.mockResolvedValue([ROW]);
    const result = await listProjects(DB);
    expect(result).toEqual([{ id: "p1", name: "Acme", status: "active", repoCount: 0, createdAt: "2026-01-01T00:00:00.000Z" }]);
  });
});

describe("getProject", () => {
  it("throws 404 when not found", async () => {
    mockFind.mockResolvedValue(undefined);
    await expect(getProject(DB, "missing")).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("createProject", () => {
  it("throws 400 when name is blank", async () => {
    await expect(createProject(DB, "   ")).rejects.toMatchObject({
      statusCode: 400,
      code: "VALIDATION_ERROR",
    });
  });
});
