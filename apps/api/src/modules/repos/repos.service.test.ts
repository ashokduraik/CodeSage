import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("./repos.repository", () => ({
  findReposByProject: vi.fn(),
  insertRepo: vi.fn(),
  deleteRepo: vi.fn(),
}));

vi.mock("../projects/projects.repository", () => ({
  findProjectById: vi.fn(),
}));

vi.mock("../../platform/queue", () => ({
  enqueueJob: vi.fn(),
}));

const { listRepos, attachRepo, detachRepo } = await import("./repos.service");
import { findReposByProject, insertRepo, deleteRepo } from "./repos.repository";
import { findProjectById } from "../projects/projects.repository";
import { enqueueJob } from "../../platform/queue";
import type { Sql } from "../../platform/db";

const mockFindProject = vi.mocked(findProjectById);
const mockFindRepos = vi.mocked(findReposByProject);
const mockInsertRepo = vi.mocked(insertRepo);
const mockDeleteRepo = vi.mocked(deleteRepo);
const mockEnqueue = vi.mocked(enqueueJob);

const DB = {} as Sql;

const PROJECT_ROW = {
  id: "p1",
  name: "Acme",
  status: "active",
  repo_count: 0,
  created_at: new Date(),
};

const REPO_ROW = {
  id: "r1",
  project_id: "p1",
  repo_url: "https://github.com/org/repo",
  provider: "github",
  branch: "main",
  role: "backend",
  last_indexed_sha: null,
  created_at: new Date("2026-01-01T00:00:00Z"),
};

afterEach(() => vi.clearAllMocks());

describe("listRepos", () => {
  it("returns repo responses when project exists", async () => {
    mockFindProject.mockResolvedValue(PROJECT_ROW);
    mockFindRepos.mockResolvedValue([REPO_ROW]);
    const result = await listRepos(DB, "p1");
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("r1");
    expect(result[0]?.lastIndexedSha).toBeUndefined();
  });

  it("throws 404 when project is not found", async () => {
    mockFindProject.mockResolvedValue(undefined);
    await expect(listRepos(DB, "missing")).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("attachRepo", () => {
  it("attaches a public repo (no token) and enqueues a sync job", async () => {
    mockFindProject.mockResolvedValue(PROJECT_ROW);
    mockInsertRepo.mockResolvedValue(REPO_ROW);
    mockEnqueue.mockResolvedValue("job-1");
    const result = await attachRepo(DB, "p1", "https://github.com/o/r", "github", "main", "backend", undefined, "");
    expect(result.repo.id).toBe("r1");
    expect(result.jobId).toBe("job-1");
    expect(mockInsertRepo).toHaveBeenCalledWith(DB, "p1", "https://github.com/o/r", "github", "main", "backend", null);
  });

  it("encrypts the token before storing when encryptionKey is provided", async () => {
    mockFindProject.mockResolvedValue(PROJECT_ROW);
    mockInsertRepo.mockResolvedValue(REPO_ROW);
    mockEnqueue.mockResolvedValue("job-2");
    const key = Buffer.alloc(32, 0xab).toString("base64");
    const result = await attachRepo(DB, "p1", "https://github.com/o/r", "github", "main", "backend", "ghp_secret", key);
    expect(result.repo.id).toBe("r1");
    // Verify encrypted token was passed (not the plaintext)
    const insertCall = mockInsertRepo.mock.calls[0];
    expect(insertCall?.[6]).not.toBe("ghp_secret");
    expect(typeof insertCall?.[6]).toBe("string");
  });

  it("throws 400 when a token is provided but encryption key is absent", async () => {
    mockFindProject.mockResolvedValue(PROJECT_ROW);
    await expect(
      attachRepo(DB, "p1", "https://github.com/o/r", "github", "main", "backend", "token", ""),
    ).rejects.toMatchObject({ statusCode: 400, code: "ENCRYPTION_NOT_CONFIGURED" });
  });

  it("throws 404 when the project is not found", async () => {
    mockFindProject.mockResolvedValue(undefined);
    await expect(
      attachRepo(DB, "missing", "https://github.com/o/r", "github", "main", "backend", undefined, ""),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("detachRepo", () => {
  it("resolves when the repo is deleted", async () => {
    mockDeleteRepo.mockResolvedValue(true);
    await expect(detachRepo(DB, "p1", "r1")).resolves.toBeUndefined();
  });

  it("throws 404 when the repo does not exist", async () => {
    mockDeleteRepo.mockResolvedValue(false);
    await expect(detachRepo(DB, "p1", "missing")).rejects.toMatchObject({ statusCode: 404 });
  });
});
