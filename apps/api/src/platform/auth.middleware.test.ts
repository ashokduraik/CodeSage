import { describe, it, expect, vi, afterEach } from "vitest";
import type { FastifyRequest } from "fastify";

vi.mock("postgres", () => {
  const mockSql = Object.assign(vi.fn(), { end: vi.fn().mockResolvedValue(undefined), json: vi.fn((v) => v) });
  return { default: vi.fn(() => mockSql) };
});

const { buildApp } = await import("../http/app");
import { isPublicRoute } from "./auth.middleware";
import type { JwtPayload } from "./auth.plugin";

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

afterEach(() => vi.clearAllMocks());

function mockRequest(method: string, url: string): FastifyRequest {
  return { method, url } as FastifyRequest;
}

describe("isPublicRoute", () => {
  it("returns true for public /api paths", () => {
    expect(isPublicRoute(mockRequest("GET", "/api/health"))).toBe(true);
    expect(isPublicRoute(mockRequest("GET", "/api/health?probe=1"))).toBe(true);
    expect(isPublicRoute(mockRequest("POST", "/api/auth/login"))).toBe(true);
    expect(isPublicRoute(mockRequest("POST", "/api/webhooks/github"))).toBe(true);
  });

  it("returns true for OPTIONS preflight on any path", () => {
    expect(isPublicRoute(mockRequest("OPTIONS", "/api/projects/p1/repos/r1"))).toBe(true);
  });

  it("returns false for non-public paths", () => {
    expect(isPublicRoute(mockRequest("GET", "/health"))).toBe(false);
    expect(isPublicRoute(mockRequest("GET", "/api/projects"))).toBe(false);
  });
});

describe("registerAuthMiddleware", () => {
  it("allows GET /api/health without a token", async () => {
    const app = buildApp(TEST_CONFIG);
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it("allows POST /api/auth/login without a token", async () => {
    const app = buildApp(TEST_CONFIG);
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "", password: "" },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("returns 401 for protected routes without a token", async () => {
    const app = buildApp(TEST_CONFIG);
    const res = await app.inject({ method: "GET", url: "/api/projects" });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: { code: "UNAUTHORIZED" } });
    await app.close();
  });

  it("allows protected routes with a valid token", async () => {
    const app = buildApp({ ...TEST_CONFIG, mockMode: true });
    await app.ready();
    const payload: JwtPayload = { sub: "u1", email: "dev@test.com", role: "developer" };
    const token = app.jwt.sign(payload);
    const res = await app.inject({
      method: "GET",
      url: "/api/projects",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
