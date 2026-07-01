import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("postgres", () => {
  const mockSql = Object.assign(vi.fn(), { end: vi.fn().mockResolvedValue(undefined), json: vi.fn((v) => v) });
  return { default: vi.fn(() => mockSql) };
});

vi.mock("./dashboard.service", () => ({
  getDashboardStats: vi.fn(),
  listDashboardSessions: vi.fn(),
}));

const { buildApp } = await import("../../http/app");
import { getDashboardStats, listDashboardSessions } from "./dashboard.service";
import type { JwtPayload } from "../../platform/auth.plugin";
import type { NodeApi } from "@codesage/shared-types";

const mockStats = vi.mocked(getDashboardStats);
const mockSessions = vi.mocked(listDashboardSessions);

type DashboardStats = NodeApi.components["schemas"]["DashboardStats"];
type ChatSession = NodeApi.components["schemas"]["ChatSession"];

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
  ragBaseUrl: "http://127.0.0.1:8001",
} as const;

const MOCK_CONFIG = { ...TEST_CONFIG, mockMode: true } as const;

afterEach(() => vi.clearAllMocks());

function devToken(app: ReturnType<typeof buildApp>): string {
  const p: JwtPayload = { sub: "u1", email: "dev@test.com", role: "developer" };
  return app.jwt.sign(p);
}

const STATS: DashboardStats = {
  projectCount: 4,
  indexedProjectCount: 1,
  sessionCount: 3,
  knowledgeCount: 18,
  pendingReviewCount: 2,
};

const SESSIONS: ChatSession[] = [
  {
    id: "s1",
    title: "Auth flow questions",
    mode: "developer",
    projectId: "p1",
    projectName: "acme/storefront",
    messageCount: 4,
    lastMessageAt: "2026-06-14T11:48:00.000Z",
  },
];

describe("GET /dashboard/stats", () => {
  it("returns 401 when unauthenticated", async () => {
    const app = buildApp(TEST_CONFIG);
    const res = await app.inject({ method: "GET", url: "/api/dashboard/stats" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("returns dashboard stats with mockMode=false", async () => {
    mockStats.mockResolvedValue(STATS);
    const app = buildApp(TEST_CONFIG);
    await app.ready();
    const res = await app.inject({
      method: "GET",
      url: "/api/dashboard/stats",
      headers: { authorization: `Bearer ${devToken(app)}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(STATS);
    expect(mockStats).toHaveBeenCalledWith(app.db, false);
    await app.close();
  });

  it("passes mockMode=true to the service when configured", async () => {
    mockStats.mockResolvedValue(STATS);
    const app = buildApp(MOCK_CONFIG);
    await app.ready();
    const res = await app.inject({
      method: "GET",
      url: "/api/dashboard/stats",
      headers: { authorization: `Bearer ${devToken(app)}` },
    });
    expect(res.statusCode).toBe(200);
    expect(mockStats).toHaveBeenCalledWith(app.db, true);
    await app.close();
  });
});

describe("GET /dashboard/sessions", () => {
  it("returns 401 when unauthenticated", async () => {
    const app = buildApp(TEST_CONFIG);
    const res = await app.inject({ method: "GET", url: "/api/dashboard/sessions" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("returns session list with mockMode=false", async () => {
    mockSessions.mockResolvedValue(SESSIONS);
    const app = buildApp(TEST_CONFIG);
    await app.ready();
    const res = await app.inject({
      method: "GET",
      url: "/api/dashboard/sessions",
      headers: { authorization: `Bearer ${devToken(app)}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(SESSIONS);
    expect(mockSessions).toHaveBeenCalledWith(app.db, false);
    await app.close();
  });

  it("passes mockMode=true to the service when configured", async () => {
    mockSessions.mockResolvedValue(SESSIONS);
    const app = buildApp(MOCK_CONFIG);
    await app.ready();
    const res = await app.inject({
      method: "GET",
      url: "/api/dashboard/sessions",
      headers: { authorization: `Bearer ${devToken(app)}` },
    });
    expect(res.statusCode).toBe(200);
    expect(mockSessions).toHaveBeenCalledWith(app.db, true);
    await app.close();
  });
});
