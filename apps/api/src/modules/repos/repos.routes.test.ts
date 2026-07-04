import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("postgres", () => {
  const mockSql = Object.assign(vi.fn(), { end: vi.fn().mockResolvedValue(undefined), json: vi.fn((v) => v) });
  return { default: vi.fn(() => mockSql) };
});

vi.mock("./repos.service", () => ({
  listRepos: vi.fn(),
  attachRepo: vi.fn(),
  detachRepo: vi.fn(),
  probeRepoUrl: vi.fn(),
  syncRepo: vi.fn(),
}));

vi.mock("../../platform/audit", () => ({
  appendAuditLog: vi.fn().mockResolvedValue("audit-1"),
  AUDIT_ACTIONS: {
    REPO_ATTACH: "repo.attach",
    REPO_DETACH: "repo.detach",
    REPO_SYNC: "repo.sync",
  },
}));

const { buildApp } = await import("../../http/app");
import { attachRepo, detachRepo, probeRepoUrl, syncRepo } from "./repos.service";
import { ApiError } from "../../platform/errors";
import type { JwtPayload } from "../../platform/auth.plugin";

const mockAttach = vi.mocked(attachRepo);
const mockDetach = vi.mocked(detachRepo);
const mockProbe = vi.mocked(probeRepoUrl);
const mockSync = vi.mocked(syncRepo);

const TEST_CONFIG = {
  host: "127.0.0.1",
  port: 0,
  nodeEnv: "test",
  logger: false,
  databaseUrl: "postgresql://test:test@localhost/test",
  jwtSecret: "test-secret-32-chars-long-enough!",
  jwtTtl: "3600",
  encryptionKey: "",
  mockMode: false,
  ragBaseUrl: "http://127.0.0.1:8001",
  webhookBaseUrl: "",
} as const;

const MOCK_REPO = {
  id: "r1",
  projectId: "p1",
  repoUrl: "https://github.com/org/repo",
  provider: "github" as const,
  branch: "main",
  fullName: "org/repo",
  isPrivate: false,
  connectionStatus: "connecting" as const,
  webhookEnabled: false,
  createdAt: "2026-01-01T00:00:00.000Z",
};

afterEach(() => vi.clearAllMocks());

function devToken(app: ReturnType<typeof buildApp>): string {
  const p: JwtPayload = { sub: "u1", email: "dev@test.com", role: "developer" };
  return app.jwt.sign(p);
}

describe("POST /repos/probe", () => {
  it("returns 401 when unauthenticated", async () => {
    const app = buildApp(TEST_CONFIG);
    const res = await app.inject({
      method: "POST",
      url: "/api/repos/probe",
      payload: { repoUrl: "https://github.com/org/repo" },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("returns probe result when authenticated", async () => {
    mockProbe.mockResolvedValue({
      provider: "github",
      fullName: "org/repo",
      defaultBranch: "main",
      branches: ["main"],
      description: "desc",
      isPrivate: false,
      authRequired: false,
      notFound: false,
    });
    const app = buildApp(TEST_CONFIG);
    await app.ready();
    const res = await app.inject({
      method: "POST",
      url: "/api/repos/probe",
      headers: { authorization: `Bearer ${devToken(app)}` },
      payload: { repoUrl: "https://github.com/org/repo" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().fullName).toBe("org/repo");
    await app.close();
  });
});

describe("POST /projects/:projectId/repos", () => {
  it("returns 202 with repo and jobId on success", async () => {
    mockAttach.mockResolvedValue({ repo: MOCK_REPO, jobId: "job-1" });
    const app = buildApp(TEST_CONFIG);
    await app.ready();
    const res = await app.inject({
      method: "POST",
      url: "/api/projects/p1/repos",
      headers: { authorization: `Bearer ${devToken(app)}` },
      payload: { repoUrl: "https://github.com/org/repo", branch: "main" },
    });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toMatchObject({ repo: { id: "r1" }, jobId: "job-1" });
    await app.close();
  });

  it("returns 400 when required fields are missing", async () => {
    const app = buildApp(TEST_CONFIG);
    await app.ready();
    const res = await app.inject({
      method: "POST",
      url: "/api/projects/p1/repos",
      headers: { authorization: `Bearer ${devToken(app)}` },
      payload: { repoUrl: "https://github.com/org/repo" },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe("DELETE /projects/:projectId/repos/:repoId", () => {
  it("returns 204 on success", async () => {
    mockDetach.mockResolvedValue(undefined);
    const app = buildApp(TEST_CONFIG);
    await app.ready();
    const res = await app.inject({
      method: "DELETE",
      url: "/api/projects/p1/repos/r1",
      headers: { authorization: `Bearer ${devToken(app)}` },
    });
    expect(res.statusCode).toBe(204);
    await app.close();
  });

  it("returns 404 when repo is not found", async () => {
    mockDetach.mockRejectedValue(new ApiError(404, "NOT_FOUND", "Repo not found in this project."));
    const app = buildApp(TEST_CONFIG);
    await app.ready();
    const res = await app.inject({
      method: "DELETE",
      url: "/api/projects/p1/repos/missing",
      headers: { authorization: `Bearer ${devToken(app)}` },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe("POST /projects/:projectId/repos/:repoId/sync", () => {
  it("returns 202 with jobId on success", async () => {
    mockSync.mockResolvedValue({ jobId: "job-sync" });
    const app = buildApp(TEST_CONFIG);
    await app.ready();
    const res = await app.inject({
      method: "POST",
      url: "/api/projects/p1/repos/r1/sync",
      headers: { authorization: `Bearer ${devToken(app)}` },
    });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ jobId: "job-sync" });
    await app.close();
  });
});
