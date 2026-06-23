import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("postgres", () => {
  const mockSql = Object.assign(vi.fn(), { end: vi.fn().mockResolvedValue(undefined), json: vi.fn((v) => v) });
  return { default: vi.fn(() => mockSql) };
});

vi.mock("./repos.service", () => ({
  listRepos: vi.fn(),
  attachRepo: vi.fn(),
  detachRepo: vi.fn(),
}));

vi.mock("../../platform/audit", () => ({
  appendAuditLog: vi.fn().mockResolvedValue("audit-1"),
  AUDIT_ACTIONS: {
    REPO_ATTACH: "repo.attach",
    REPO_DETACH: "repo.detach",
  },
}));

const { buildApp } = await import("../../http/app");
import { listRepos, attachRepo, detachRepo } from "./repos.service";
import { ApiError } from "../../platform/errors";
import type { JwtPayload } from "../../platform/auth.plugin";

const mockList = vi.mocked(listRepos);
const mockAttach = vi.mocked(attachRepo);
const mockDetach = vi.mocked(detachRepo);

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
} as const;

const MOCK_REPO = {
  id: "r1",
  projectId: "p1",
  repoUrl: "https://github.com/org/repo",
  provider: "github" as const,
  branch: "main",
  role: "backend" as const,
  createdAt: "2026-01-01T00:00:00.000Z",
};

afterEach(() => vi.clearAllMocks());

function devToken(app: ReturnType<typeof buildApp>): string {
  const p: JwtPayload = { sub: "u1", email: "dev@test.com", role: "developer" };
  return app.jwt.sign(p);
}

describe("GET /projects/:projectId/repos", () => {
  it("returns 401 when unauthenticated", async () => {
    const app = buildApp(TEST_CONFIG);
    const res = await app.inject({ method: "GET", url: "/api/projects/p1/repos" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("returns the repo list", async () => {
    mockList.mockResolvedValue([MOCK_REPO]);
    const app = buildApp(TEST_CONFIG);
    await app.ready();
    const res = await app.inject({
      method: "GET",
      url: "/api/projects/p1/repos",
      headers: { authorization: `Bearer ${devToken(app)}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([MOCK_REPO]);
    await app.close();
  });

  it("returns 404 when project does not exist", async () => {
    mockList.mockRejectedValue(new ApiError(404, "NOT_FOUND", "Project not found."));
    const app = buildApp(TEST_CONFIG);
    await app.ready();
    const res = await app.inject({
      method: "GET",
      url: "/api/projects/missing/repos",
      headers: { authorization: `Bearer ${devToken(app)}` },
    });
    expect(res.statusCode).toBe(404);
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
      payload: {
        repoUrl: "https://github.com/org/repo",
        provider: "github",
        branch: "main",
        role: "backend",
      },
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

  it("returns 404 when project is not found", async () => {
    mockAttach.mockRejectedValue(new ApiError(404, "NOT_FOUND", "Project not found."));
    const app = buildApp(TEST_CONFIG);
    await app.ready();
    const res = await app.inject({
      method: "POST",
      url: "/api/projects/missing/repos",
      headers: { authorization: `Bearer ${devToken(app)}` },
      payload: {
        repoUrl: "https://github.com/org/repo",
        provider: "github",
        branch: "main",
        role: "backend",
      },
    });
    expect(res.statusCode).toBe(404);
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
