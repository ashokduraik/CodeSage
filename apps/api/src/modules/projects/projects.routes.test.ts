import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("postgres", () => {
  const mockSql = Object.assign(vi.fn(), { end: vi.fn().mockResolvedValue(undefined), json: vi.fn((v) => v) });
  return { default: vi.fn(() => mockSql) };
});

vi.mock("./projects.service", () => ({
  listProjects: vi.fn(),
  getProject: vi.fn(),
  createProject: vi.fn(),
  removeProject: vi.fn(),
}));

vi.mock("../../platform/audit", () => ({
  appendAuditLog: vi.fn().mockResolvedValue("audit-1"),
  AUDIT_ACTIONS: {
    PROJECT_CREATE: "project.create",
    PROJECT_DELETE: "project.delete",
  },
}));

const { buildApp } = await import("../../http/app");
import { listProjects, getProject, createProject, removeProject } from "./projects.service";
import { ApiError } from "../../platform/errors";
import type { JwtPayload } from "../../platform/auth.plugin";

const mockList = vi.mocked(listProjects);
const mockGet = vi.mocked(getProject);
const mockCreate = vi.mocked(createProject);
const mockRemove = vi.mocked(removeProject);

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
  workerStaleJobSeconds: 600,
} as const;

const MOCK_PROJECT = {
  id: "p1",
  name: "Acme",
  status: "active" as const,
  repoCount: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
};

afterEach(() => vi.clearAllMocks());

function devToken(app: ReturnType<typeof buildApp>): string {
  const p: JwtPayload = { sub: "u1", email: "dev@test.com", role: "developer" };
  return app.jwt.sign(p);
}

describe("GET /projects", () => {
  it("returns 401 when unauthenticated", async () => {
    const app = buildApp(TEST_CONFIG);
    const res = await app.inject({ method: "GET", url: "/api/projects" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("returns the list of projects", async () => {
    mockList.mockResolvedValue([MOCK_PROJECT]);
    const app = buildApp(TEST_CONFIG);
    await app.ready();
    const res = await app.inject({
      method: "GET",
      url: "/api/projects",
      headers: { authorization: `Bearer ${devToken(app)}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([MOCK_PROJECT]);
    await app.close();
  });

  it("returns static mock data when mockMode is enabled", async () => {
    const app = buildApp({ ...TEST_CONFIG, mockMode: true });
    await app.ready();
    const res = await app.inject({
      method: "GET",
      url: "/api/projects",
      headers: { authorization: `Bearer ${devToken(app)}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as unknown[];
    expect(body.length).toBeGreaterThan(0);
    expect(mockList).not.toHaveBeenCalled();
    await app.close();
  });
});

describe("POST /projects", () => {
  it("returns 201 and the created project", async () => {
    mockCreate.mockResolvedValue(MOCK_PROJECT);
    const app = buildApp(TEST_CONFIG);
    await app.ready();
    const res = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: { authorization: `Bearer ${devToken(app)}` },
      payload: { name: "Acme" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ id: "p1" });
    await app.close();
  });

  it("returns 400 when name is missing", async () => {
    const app = buildApp(TEST_CONFIG);
    await app.ready();
    const res = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: { authorization: `Bearer ${devToken(app)}` },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe("GET /projects/:projectId", () => {
  it("returns the project when found", async () => {
    mockGet.mockResolvedValue(MOCK_PROJECT);
    const app = buildApp(TEST_CONFIG);
    await app.ready();
    const res = await app.inject({
      method: "GET",
      url: "/api/projects/p1",
      headers: { authorization: `Bearer ${devToken(app)}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: "p1" });
    await app.close();
  });

  it("returns 404 when not found", async () => {
    mockGet.mockRejectedValue(new ApiError(404, "NOT_FOUND", "Project not found."));
    const app = buildApp(TEST_CONFIG);
    await app.ready();
    const res = await app.inject({
      method: "GET",
      url: "/api/projects/missing",
      headers: { authorization: `Bearer ${devToken(app)}` },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe("DELETE /projects/:projectId", () => {
  it("returns 204 on success", async () => {
    mockRemove.mockResolvedValue(undefined);
    const app = buildApp(TEST_CONFIG);
    await app.ready();
    const res = await app.inject({
      method: "DELETE",
      url: "/api/projects/p1",
      headers: { authorization: `Bearer ${devToken(app)}` },
    });
    expect(res.statusCode).toBe(204);
    await app.close();
  });

  it("returns 404 when the project does not exist", async () => {
    mockRemove.mockRejectedValue(new ApiError(404, "NOT_FOUND", "Project not found."));
    const app = buildApp(TEST_CONFIG);
    await app.ready();
    const res = await app.inject({
      method: "DELETE",
      url: "/api/projects/missing",
      headers: { authorization: `Bearer ${devToken(app)}` },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
