import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("postgres", () => {
  const mockSql = Object.assign(vi.fn(), { end: vi.fn().mockResolvedValue(undefined), json: vi.fn((v) => v) });
  return { default: vi.fn(() => mockSql) };
});

vi.mock("./audit.service", () => ({
  listAuditLogs: vi.fn(),
}));

const { buildApp } = await import("../../http/app");
import { listAuditLogs } from "./audit.service";
import type { JwtPayload } from "../../platform/auth.plugin";

const mockList = vi.mocked(listAuditLogs);

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

const LIST_RESPONSE = {
  items: [
    {
      id: "a1",
      actorId: "u1",
      actorEmail: "admin@example.com",
      action: "project.create" as const,
      target: "p1",
      ts: "2026-07-04T10:00:00.000Z",
    },
  ],
  page: 1,
  pageSize: 25,
  hasMore: false,
  tsFrom: "2026-06-04T12:00:00.000Z",
  tsTo: "2026-07-04T12:00:00.000Z",
};

afterEach(() => vi.clearAllMocks());

function token(app: ReturnType<typeof buildApp>, role: JwtPayload["role"]): string {
  return app.jwt.sign({ sub: "u1", email: "user@test.com", role });
}

describe("GET /audit-logs", () => {
  it("returns 401 when unauthenticated", async () => {
    const app = buildApp(TEST_CONFIG);
    const res = await app.inject({ method: "GET", url: "/api/audit-logs" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("returns 403 for non-admin roles", async () => {
    const app = buildApp(TEST_CONFIG);
    await app.ready();
    const res = await app.inject({
      method: "GET",
      url: "/api/audit-logs",
      headers: { authorization: `Bearer ${token(app, "developer")}` },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("returns audit log list for admin", async () => {
    mockList.mockResolvedValue(LIST_RESPONSE);
    const app = buildApp(TEST_CONFIG);
    await app.ready();
    const res = await app.inject({
      method: "GET",
      url: "/api/audit-logs?page=1",
      headers: { authorization: `Bearer ${token(app, "admin")}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(LIST_RESPONSE);
    await app.close();
  });
});
