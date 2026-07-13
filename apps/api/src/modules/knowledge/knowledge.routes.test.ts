import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("postgres", () => {
  const mockSql = Object.assign(vi.fn(), {
    end: vi.fn().mockResolvedValue(undefined),
    json: vi.fn((value) => value),
  });
  return { default: vi.fn(() => mockSql) };
});

vi.mock("./knowledge.service", () => ({
  getWorkflows: vi.fn(),
  getPages: vi.fn(),
  getPermissions: vi.fn(),
  getDataFlows: vi.fn(),
}));

const { buildApp } = await import("../../http/app");
import {
  getDataFlows,
  getPages,
  getPermissions,
  getWorkflows,
} from "./knowledge.service";
import type { JwtPayload } from "../../platform/auth.plugin";

const mockWorkflows = vi.mocked(getWorkflows);
const mockPages = vi.mocked(getPages);
const mockPermissions = vi.mocked(getPermissions);
const mockDataFlows = vi.mocked(getDataFlows);

const TEST_CONFIG = {
  host: "127.0.0.1",
  port: 0,
  nodeEnv: "test",
  logger: false,
  databaseUrl: "postgresql://test:test@localhost/test",
  jwtSecret: "test-secret-32-chars-long-enough!",
  jwtTtl: "1h",
  encryptionKey: "",
  mockMode: false,
  engineBaseUrl: "http://127.0.0.1:8001",
  webhookBaseUrl: "",
  workerStaleJobSeconds: 600,
} as const;

const PROJECT_ID = "a0000001-0000-4000-8000-000000000001";

afterEach(() => vi.clearAllMocks());

function devToken(app: ReturnType<typeof buildApp>): string {
  const payload: JwtPayload = { sub: "u1", email: "dev@test.com", role: "developer" };
  return app.jwt.sign(payload);
}

describe("knowledge.routes", () => {
  it("returns workflows for an existing project", async () => {
    const app = buildApp(TEST_CONFIG);
    await app.ready();
    mockWorkflows.mockResolvedValue([
      {
        id: "w1",
        name: "checkout",
        steps: [],
        confidence: 0.75,
        sourceRefs: [],
      },
    ]);

    const response = await app.inject({
      method: "GET",
      url: `/api/projects/${PROJECT_ID}/workflows`,
      headers: { authorization: `Bearer ${devToken(app)}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      { id: "w1", name: "checkout", steps: [], confidence: 0.75, sourceRefs: [] },
    ]);
    await app.close();
  });

  it("returns 404 when workflows project is missing", async () => {
    const app = buildApp(TEST_CONFIG);
    await app.ready();
    mockWorkflows.mockRejectedValue(new Error("PROJECT_NOT_FOUND"));

    const response = await app.inject({
      method: "GET",
      url: `/api/projects/${PROJECT_ID}/workflows`,
      headers: { authorization: `Bearer ${devToken(app)}` },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: { code: "NOT_FOUND", message: "Project not found." },
    });
    await app.close();
  });

  it("rethrows unexpected workflow errors", async () => {
    const app = buildApp(TEST_CONFIG);
    await app.ready();
    mockWorkflows.mockRejectedValue(new Error("DB_DOWN"));

    const response = await app.inject({
      method: "GET",
      url: `/api/projects/${PROJECT_ID}/workflows`,
      headers: { authorization: `Bearer ${devToken(app)}` },
    });

    expect(response.statusCode).toBe(500);
    await app.close();
  });

  it("returns 404 when pages project is missing", async () => {
    const app = buildApp(TEST_CONFIG);
    await app.ready();
    mockPages.mockRejectedValue(new Error("PROJECT_NOT_FOUND"));

    const response = await app.inject({
      method: "GET",
      url: `/api/projects/${PROJECT_ID}/pages`,
      headers: { authorization: `Bearer ${devToken(app)}` },
    });

    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it("returns 404 when permissions project is missing", async () => {
    const app = buildApp(TEST_CONFIG);
    await app.ready();
    mockPermissions.mockRejectedValue(new Error("PROJECT_NOT_FOUND"));

    const response = await app.inject({
      method: "GET",
      url: `/api/projects/${PROJECT_ID}/permissions`,
      headers: { authorization: `Bearer ${devToken(app)}` },
    });

    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it("returns 404 when data flows project is missing", async () => {
    const app = buildApp(TEST_CONFIG);
    await app.ready();
    mockDataFlows.mockRejectedValue(new Error("PROJECT_NOT_FOUND"));

    const response = await app.inject({
      method: "GET",
      url: `/api/projects/${PROJECT_ID}/data-flows`,
      headers: { authorization: `Bearer ${devToken(app)}` },
    });

    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it("returns pages for an existing project", async () => {
    const app = buildApp(TEST_CONFIG);
    await app.ready();
    mockPages.mockResolvedValue([
      {
        id: "p1",
        route: "/home",
        components: [],
        dataSources: [],
        confidence: 0.7,
        sourceRefs: [],
      },
    ]);

    const response = await app.inject({
      method: "GET",
      url: `/api/projects/${PROJECT_ID}/pages`,
      headers: { authorization: `Bearer ${devToken(app)}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()[0]?.route).toBe("/home");
    await app.close();
  });

  it("returns permissions for an existing project", async () => {
    const app = buildApp(TEST_CONFIG);
    await app.ready();
    mockPermissions.mockResolvedValue([
      {
        id: "r1",
        target: "/admin",
        requiredPermission: "admin",
        confidence: 0.8,
        sourceRefs: [],
      },
    ]);

    const response = await app.inject({
      method: "GET",
      url: `/api/projects/${PROJECT_ID}/permissions`,
      headers: { authorization: `Bearer ${devToken(app)}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()[0]?.requiredPermission).toBe("admin");
    await app.close();
  });

  it("returns data flows for an existing project", async () => {
    const app = buildApp(TEST_CONFIG);
    await app.ready();
    mockDataFlows.mockResolvedValue([
      {
        id: "f1",
        pageRef: "/orders",
        sourceChain: [],
        freshnessType: "cached",
        confidence: 0.65,
        sourceRefs: [],
      },
    ]);

    const response = await app.inject({
      method: "GET",
      url: `/api/projects/${PROJECT_ID}/data-flows`,
      headers: { authorization: `Bearer ${devToken(app)}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()[0]?.pageRef).toBe("/orders");
    await app.close();
  });

  it("rethrows unexpected page errors", async () => {
    const app = buildApp(TEST_CONFIG);
    await app.ready();
    mockPages.mockRejectedValue(new Error("DB_DOWN"));

    const response = await app.inject({
      method: "GET",
      url: `/api/projects/${PROJECT_ID}/pages`,
      headers: { authorization: `Bearer ${devToken(app)}` },
    });

    expect(response.statusCode).toBe(500);
    await app.close();
  });

  it("rethrows unexpected permission errors", async () => {
    const app = buildApp(TEST_CONFIG);
    await app.ready();
    mockPermissions.mockRejectedValue(new Error("DB_DOWN"));

    const response = await app.inject({
      method: "GET",
      url: `/api/projects/${PROJECT_ID}/permissions`,
      headers: { authorization: `Bearer ${devToken(app)}` },
    });

    expect(response.statusCode).toBe(500);
    await app.close();
  });

  it("rethrows unexpected data flow errors", async () => {
    const app = buildApp(TEST_CONFIG);
    await app.ready();
    mockDataFlows.mockRejectedValue(new Error("DB_DOWN"));

    const response = await app.inject({
      method: "GET",
      url: `/api/projects/${PROJECT_ID}/data-flows`,
      headers: { authorization: `Bearer ${devToken(app)}` },
    });

    expect(response.statusCode).toBe(500);
    await app.close();
  });
});
