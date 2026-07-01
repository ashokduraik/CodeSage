import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("postgres", () => {
  const mockSql = Object.assign(vi.fn(), { end: vi.fn().mockResolvedValue(undefined), json: vi.fn((v) => v) });
  return { default: vi.fn(() => mockSql) };
});

const { buildApp } = await import("../http/app");
import { requireAuth } from "./auth.plugin";
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
} as const;

afterEach(() => vi.clearAllMocks());

describe("requireAuth", () => {
  it("returns 401 when no Authorization header is present", async () => {
    const app = buildApp(TEST_CONFIG);
    app.get("/protected", { preHandler: requireAuth() }, async () => ({ ok: true }));
    const res = await app.inject({ method: "GET", url: "/protected" });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: { code: "UNAUTHORIZED" } });
    await app.close();
  });

  it("returns 401 when the JWT is invalid", async () => {
    const app = buildApp(TEST_CONFIG);
    app.get("/protected", { preHandler: requireAuth() }, async () => ({ ok: true }));
    const res = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { authorization: "Bearer invalid.token.here" },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("allows a valid token with no role restriction", async () => {
    const app = buildApp(TEST_CONFIG);
    const payload: JwtPayload = { sub: "u1", email: "u@test.com", role: "developer" };
    app.get("/protected", { preHandler: requireAuth() }, async (req) => req.user);
    await app.ready();
    const token = app.jwt.sign(payload);
    const res = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ sub: "u1", role: "developer" });
    await app.close();
  });

  it("returns 403 when the role is not in the allowed list", async () => {
    const app = buildApp(TEST_CONFIG);
    const payload: JwtPayload = { sub: "u1", email: "u@test.com", role: "developer" };
    app.get("/admin-only", { preHandler: requireAuth(["admin"]) }, async () => ({ ok: true }));
    await app.ready();
    const token = app.jwt.sign(payload);
    const res = await app.inject({
      method: "GET",
      url: "/admin-only",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
    await app.close();
  });

  it("allows a token whose role matches the allowed list", async () => {
    const app = buildApp(TEST_CONFIG);
    const payload: JwtPayload = { sub: "u1", email: "a@test.com", role: "admin" };
    app.get("/admin-only", { preHandler: requireAuth(["admin"]) }, async () => ({ ok: true }));
    await app.ready();
    const token = app.jwt.sign(payload);
    const res = await app.inject({
      method: "GET",
      url: "/admin-only",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe("requireRoles", () => {
  it("returns 403 when the role is not allowed", async () => {
    const app = buildApp(TEST_CONFIG);
    const { requireRoles } = await import("./auth.plugin");
    const payload: JwtPayload = { sub: "u1", email: "u@test.com", role: "developer" };
    app.addHook("onRequest", async (request) => {
      request.user = payload;
    });
    app.get("/admin-only", { preHandler: requireRoles(["admin"]) }, async () => ({ ok: true }));
    const res = await app.inject({ method: "GET", url: "/admin-only" });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("allows a matching role", async () => {
    const app = buildApp(TEST_CONFIG);
    const { requireRoles } = await import("./auth.plugin");
    const payload: JwtPayload = { sub: "u1", email: "a@test.com", role: "admin" };
    app.addHook("onRequest", async (request) => {
      request.user = payload;
    });
    app.get("/admin-only", { preHandler: requireRoles(["admin"]) }, async () => ({ ok: true }));
    const res = await app.inject({ method: "GET", url: "/admin-only" });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
