import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("./repos.repository", () => ({
  findReposByProject: vi.fn(),
  findRepoById: vi.fn(),
  findRepoSecretsById: vi.fn(),
  insertRepo: vi.fn(),
  updateRepoWebhook: vi.fn(),
  softDeleteRepo: vi.fn(),
  setRepoConnecting: vi.fn(),
}));

vi.mock("../projects/projects.repository", () => ({
  findProjectById: vi.fn(),
}));

vi.mock("../../platform/queue", () => ({
  enqueueJob: vi.fn(),
}));

vi.mock("./repo-probe.service", () => ({
  probeRepo: vi.fn(),
}));

vi.mock("./repo-webhook.service", () => ({
  registerRepoWebhook: vi.fn(),
  unregisterRepoWebhook: vi.fn(),
}));

const { listRepos, attachRepo, detachRepo, syncRepo } = await import("./repos.service");
import {
  findReposByProject,
  findRepoById,
  findRepoSecretsById,
  insertRepo,
  updateRepoWebhook,
  softDeleteRepo,
  setRepoConnecting,
} from "./repos.repository";
import { findProjectById } from "../projects/projects.repository";
import { enqueueJob } from "../../platform/queue";
import { registerRepoWebhook, unregisterRepoWebhook } from "./repo-webhook.service";
import type { Sql } from "../../platform/db";

const mockFindProject = vi.mocked(findProjectById);
const mockFindRepos = vi.mocked(findReposByProject);
const mockFindRepoById = vi.mocked(findRepoById);
const mockInsertRepo = vi.mocked(insertRepo);
const mockUpdateWebhook = vi.mocked(updateRepoWebhook);
const mockFindSecrets = vi.mocked(findRepoSecretsById);
const mockSoftDeleteRepo = vi.mocked(softDeleteRepo);
const mockSetConnecting = vi.mocked(setRepoConnecting);
const mockEnqueue = vi.mocked(enqueueJob);
const mockRegisterWebhook = vi.mocked(registerRepoWebhook);
const mockUnregisterWebhook = vi.mocked(unregisterRepoWebhook);

const DB = {} as Sql;
const ACTOR = "u1";

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
  full_name: "org/repo",
  description: "A repo",
  base_url: null,
  is_private: false,
  connection_status: "connecting",
  last_error: null,
  last_error_at: null,
  webhook_id: null,
  webhook_enabled: false,
  last_indexed_sha: "abc123",
  last_indexed_at: new Date("2026-06-01T12:00:00Z"),
  primary_language: "TypeScript",
  status: "A",
  created_at: new Date("2026-01-01T00:00:00Z"),
};

afterEach(() => vi.clearAllMocks());

describe("listRepos", () => {
  it("returns repo responses with metadata when project exists", async () => {
    mockFindProject.mockResolvedValue(PROJECT_ROW);
    mockFindRepos.mockResolvedValue([{ ...REPO_ROW, indexed_file_count: 45 }]);
    const result = await listRepos(DB, "p1");
    expect(result).toHaveLength(1);
    expect(result[0]?.fullName).toBe("org/repo");
    expect(result[0]?.primaryLanguage).toBe("TypeScript");
    expect(result[0]?.indexedFileCount).toBe(45);
    expect(result[0]?.lastIndexedAt).toBe("2026-06-01T12:00:00.000Z");
  });

  it("throws 404 when project is not found", async () => {
    mockFindProject.mockResolvedValue(undefined);
    await expect(listRepos(DB, "missing")).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("attachRepo", () => {
  it("attaches a public repo and enqueues a sync job", async () => {
    mockFindProject.mockResolvedValue(PROJECT_ROW);
    mockInsertRepo.mockResolvedValue(REPO_ROW);
    mockRegisterWebhook.mockResolvedValue({
      webhookId: null,
      webhookSecretEnc: null,
      webhookEnabled: false,
    });
    mockEnqueue.mockResolvedValue("job-1");

    const result = await attachRepo(
      DB,
      "p1",
      { repoUrl: "https://github.com/org/repo", branch: "main", primaryLanguage: "TypeScript" },
      "",
      "",
      ACTOR,
    );
    expect(result.repo.id).toBe("r1");
    expect(result.jobId).toBe("job-1");
    expect(mockInsertRepo).toHaveBeenCalledWith(
      DB,
      expect.objectContaining({ primaryLanguage: "TypeScript" }),
      ACTOR,
    );
  });

  it("encrypts the token before storing when encryptionKey is provided", async () => {
    mockFindProject.mockResolvedValue(PROJECT_ROW);
    mockInsertRepo.mockResolvedValue(REPO_ROW);
    mockRegisterWebhook.mockResolvedValue({
      webhookId: "99",
      webhookSecretEnc: "enc-secret",
      webhookEnabled: true,
    });
    mockEnqueue.mockResolvedValue("job-2");
    const key = Buffer.alloc(32, 0xab).toString("base64");

    await attachRepo(
      DB,
      "p1",
      { repoUrl: "https://github.com/org/repo", branch: "main", token: "ghp_secret" },
      key,
      "https://codesage.example.com",
      ACTOR,
    );

    const insertCall = mockInsertRepo.mock.calls[0]?.[1];
    expect(insertCall?.tokenEnc).not.toBe("ghp_secret");
    expect(mockUpdateWebhook).toHaveBeenCalledWith(DB, "r1", "99", "enc-secret", ACTOR);
  });

  it("throws 400 when a token is provided but encryption key is absent", async () => {
    mockFindProject.mockResolvedValue(PROJECT_ROW);
    await expect(
      attachRepo(
        DB,
        "p1",
        { repoUrl: "https://github.com/org/repo", branch: "main", token: "token" },
        "",
        "",
        ACTOR,
      ),
    ).rejects.toMatchObject({ statusCode: 400, code: "ENCRYPTION_NOT_CONFIGURED" });
  });

  it("throws 404 when the project is not found", async () => {
    mockFindProject.mockResolvedValue(undefined);
    await expect(
      attachRepo(
        DB,
        "missing",
        { repoUrl: "https://github.com/org/repo", branch: "main" },
        "",
        "",
        ACTOR,
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("throws 400 for invalid repo URL", async () => {
    mockFindProject.mockResolvedValue(PROJECT_ROW);
    await expect(
      attachRepo(DB, "p1", { repoUrl: "not-a-url", branch: "main" }, "", "", ACTOR),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("syncRepo", () => {
  it("sets connecting and enqueues a sync job", async () => {
    mockFindRepoById.mockResolvedValue(REPO_ROW);
    mockEnqueue.mockResolvedValue("job-sync");

    const result = await syncRepo(DB, "p1", "r1", ACTOR);
    expect(result.jobId).toBe("job-sync");
    expect(mockSetConnecting).toHaveBeenCalledWith(DB, "r1", ACTOR);
    expect(mockEnqueue).toHaveBeenCalledWith(DB, "sync", { repoId: "r1" }, ACTOR);
  });

  it("throws 404 when the repo does not exist", async () => {
    mockFindRepoById.mockResolvedValue(undefined);
    await expect(syncRepo(DB, "p1", "missing", ACTOR)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("detachRepo", () => {
  it("unregisters webhook and soft-deletes the repo", async () => {
    mockFindSecrets.mockResolvedValue({
      ...REPO_ROW,
      token_enc: null,
      webhook_secret_enc: null,
      webhook_id: "1",
    });
    mockSoftDeleteRepo.mockResolvedValue(true);
    await detachRepo(DB, "p1", "r1", "", ACTOR);
    expect(mockUnregisterWebhook).toHaveBeenCalled();
    expect(mockSoftDeleteRepo).toHaveBeenCalledWith(DB, "p1", "r1", ACTOR);
  });

  it("throws 404 when the repo does not exist", async () => {
    mockFindSecrets.mockResolvedValue(undefined);
    await expect(detachRepo(DB, "p1", "missing", "", ACTOR)).rejects.toMatchObject({ statusCode: 404 });
  });
});
