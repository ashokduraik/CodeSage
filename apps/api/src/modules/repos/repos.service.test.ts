import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("./repos.repository", () => ({
  findReposByProject: vi.fn(),
  findRepoById: vi.fn(),
  findRepoSecretsById: vi.fn(),
  insertRepo: vi.fn(),
  updateRepoWebhook: vi.fn(),
  softDeleteRepo: vi.fn(),
  setRepoConnecting: vi.fn(),
  findIndexingEventsByRepo: vi.fn(),
}));

vi.mock("../projects/projects.repository", () => ({
  findProjectById: vi.fn(),
}));

vi.mock("../../platform/queue", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../platform/queue")>();
  return {
    ...actual,
    enqueueJob: vi.fn(),
    cancelPendingJobsForRepo: vi.fn(),
    findActiveJobsForRepo: vi.fn(),
  };
});

vi.mock("./repo-probe.service", () => ({
  probeRepo: vi.fn(),
}));

vi.mock("./repo-webhook.service", () => ({
  registerRepoWebhook: vi.fn(),
  unregisterRepoWebhook: vi.fn(),
}));

const { listRepos, attachRepo, detachRepo, syncRepo, listRepoIndexingEvents } = await import("./repos.service");
import {
  findReposByProject,
  findRepoById,
  findRepoSecretsById,
  insertRepo,
  updateRepoWebhook,
  softDeleteRepo,
  setRepoConnecting,
  findIndexingEventsByRepo,
} from "./repos.repository";
import { findProjectById } from "../projects/projects.repository";
import {
  cancelPendingJobsForRepo,
  enqueueJob,
  findActiveJobsForRepo,
} from "../../platform/queue";
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
const mockFindIndexingEvents = vi.mocked(findIndexingEventsByRepo);
const mockEnqueue = vi.mocked(enqueueJob);
const mockCancelPending = vi.mocked(cancelPendingJobsForRepo);
const mockFindActiveJobs = vi.mocked(findActiveJobsForRepo);
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
    mockCancelPending.mockResolvedValue(0);

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
    expect(mockCancelPending).toHaveBeenCalledWith(DB, "r1", ACTOR);
    expect(mockEnqueue).toHaveBeenCalledWith(
      DB,
      "sync",
      { repoId: "r1", trigger: "initial_attach" },
      ACTOR,
    );
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
  it("sets connecting and enqueues a sync job when no active jobs exist", async () => {
    mockFindRepoById.mockResolvedValue(REPO_ROW);
    mockFindActiveJobs.mockResolvedValue([]);
    mockCancelPending.mockResolvedValue(0);
    mockEnqueue.mockResolvedValue("job-sync");

    const result = await syncRepo(DB, "p1", "r1", ACTOR);
    expect(result.jobId).toBe("job-sync");
    expect(mockSetConnecting).toHaveBeenCalledWith(DB, "r1", ACTOR);
    expect(mockCancelPending).toHaveBeenCalledWith(DB, "r1", ACTOR);
    expect(mockEnqueue).toHaveBeenCalledWith(DB, "sync", { repoId: "r1", trigger: "manual_sync" }, ACTOR);
  });

  it("throws 409 when active job is younger than stale threshold", async () => {
    mockFindRepoById.mockResolvedValue(REPO_ROW);
    mockFindActiveJobs.mockResolvedValue([
      {
        id: "j1",
        job_status: "pending",
        created_at: new Date(),
        locked_at: null,
      },
    ]);

    await expect(syncRepo(DB, "p1", "r1", ACTOR, 600)).rejects.toMatchObject({
      statusCode: 409,
      code: "CONFLICT",
    });
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("cancels stale pending jobs then enqueues sync", async () => {
    mockFindRepoById.mockResolvedValue(REPO_ROW);
    const old = new Date(Date.now() - 700_000);
    mockFindActiveJobs.mockResolvedValue([
      {
        id: "j1",
        job_status: "pending",
        created_at: old,
        locked_at: null,
      },
    ]);
    mockCancelPending.mockResolvedValue(2);
    mockEnqueue.mockResolvedValue("job-sync");

    const result = await syncRepo(DB, "p1", "r1", ACTOR, 600);
    expect(result.jobId).toBe("job-sync");
    expect(mockCancelPending).toHaveBeenCalledWith(DB, "r1", ACTOR);
  });

  it("throws 404 when the repo does not exist", async () => {
    mockFindRepoById.mockResolvedValue(undefined);
    await expect(syncRepo(DB, "p1", "missing", ACTOR)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("detachRepo", () => {
  it("unregisters webhook, cancels pending jobs, soft-deletes the repo, and enqueues clone cleanup", async () => {
    mockFindSecrets.mockResolvedValue({
      ...REPO_ROW,
      token_enc: null,
      webhook_secret_enc: null,
      webhook_id: "1",
    });
    mockSoftDeleteRepo.mockResolvedValue(true);
    mockCancelPending.mockResolvedValue(2);
    mockEnqueue.mockResolvedValue("job-cleanup");
    await detachRepo(DB, "p1", "r1", "", ACTOR);
    expect(mockUnregisterWebhook).toHaveBeenCalled();
    expect(mockCancelPending).toHaveBeenCalledWith(DB, "r1", ACTOR);
    expect(mockSoftDeleteRepo).toHaveBeenCalledWith(DB, "p1", "r1", ACTOR);
    expect(mockEnqueue).toHaveBeenCalledWith(
      DB,
      "repo_cleanup",
      { repoId: "r1", reason: "repo_detach" },
      ACTOR,
    );
  });

  it("throws 404 when the repo does not exist", async () => {
    mockFindSecrets.mockResolvedValue(undefined);
    await expect(detachRepo(DB, "p1", "missing", "", ACTOR)).rejects.toMatchObject({ statusCode: 404 });
    expect(mockCancelPending).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});

const EVENT_ROW = {
  id: "e1",
  run_id: "run-1",
  step: "sync",
  phase: "finished",
  started_at: new Date("2026-07-04T14:36:00.000Z"),
  duration_ms: 374,
  message: "Repository synced.",
  failure_reason: null,
  trigger: "manual_sync",
  details: { commit_sha: "abc" },
};

describe("listRepoIndexingEvents", () => {
  it("returns empty list when repo exists but has no events", async () => {
    mockFindRepoById.mockResolvedValue(REPO_ROW);
    mockFindIndexingEvents.mockResolvedValue([]);
    const result = await listRepoIndexingEvents(DB, "p1", "r1");
    expect(result).toEqual({ items: [], limit: 50, hasMore: false, nextCursor: null });
  });

  it("returns hasMore and nextCursor when extra row is fetched", async () => {
    mockFindRepoById.mockResolvedValue(REPO_ROW);
    mockFindIndexingEvents.mockResolvedValue([
      EVENT_ROW,
      { ...EVENT_ROW, id: "e2", started_at: new Date("2026-07-04T14:35:00.000Z") },
    ]);
    const result = await listRepoIndexingEvents(DB, "p1", "r1", { limit: 1 });
    expect(result.items).toHaveLength(1);
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBeTruthy();
    expect(result.items[0]?.runId).toBe("run-1");
  });

  it("throws 404 when repo is missing", async () => {
    mockFindRepoById.mockResolvedValue(undefined);
    await expect(listRepoIndexingEvents(DB, "p1", "missing")).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("throws 400 for invalid cursor", async () => {
    mockFindRepoById.mockResolvedValue(REPO_ROW);
    await expect(
      listRepoIndexingEvents(DB, "p1", "r1", { cursor: "bad-cursor" }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("maps distill events to the public response shape", async () => {
    mockFindRepoById.mockResolvedValue(REPO_ROW);
    mockFindIndexingEvents.mockResolvedValue([
      {
        ...EVENT_ROW,
        id: "e-distill",
        step: "distill",
        phase: "finished",
        message: "Built project knowledge — 0 workflows, 0 pages, 0 permissions, 0 data flows",
        trigger: null,
        details: { workflows: 0, page_map: 0, permission_rules: 0, data_flows: 0 },
      },
    ]);
    const result = await listRepoIndexingEvents(DB, "p1", "r1");
    expect(result.items[0]).toMatchObject({
      step: "distill",
      phase: "finished",
      message: expect.stringContaining("Built project knowledge"),
    });
  });
});
