import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("postgres", () => {
  const mockSql = Object.assign(vi.fn(), { end: vi.fn().mockResolvedValue(undefined), json: vi.fn((v) => v) });
  return { default: vi.fn(() => mockSql) };
});

vi.mock("./users.service", () => ({
  getUserById: vi.fn(),
  createNewUser: vi.fn(),
  changeUserRole: vi.fn(),
}));

vi.mock("../../platform/audit", () => ({
  appendAuditLog: vi.fn().mockResolvedValue("audit-1"),
  AUDIT_ACTIONS: {
    USER_CREATE: "user.create",
    USER_ROLE_CHANGE: "user.role_change",
  },
}));

const { buildApp } = await import("../../http/app");
import { getUserById, createNewUser, changeUserRole } from "./users.service";
import { ApiError } from "../../platform/errors";
import type { JwtPayload } from "../../platform/auth.plugin";

const mockGetUser = vi.mocked(getUserById);
const mockCreateUser = vi.mocked(createNewUser);
const mockChangeRole = vi.mocked(changeUserRole);

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
  engineBaseUrl: "http://127.0.0.1:8001",
  webhookBaseUrl: "",
  workerStaleJobSeconds: 600,
} as const;

const MOCK_USER = {
  id: "u1",
  email: "user@example.com",
  role: "developer" as const,
  createdAt: "2026-01-01T00:00:00.000Z",
};

function makeToken(app: Awaited<ReturnType<typeof buildApp>>, payload: JwtPayload): string {
  return app.jwt.sign(payload);
}

afterEach(() => vi.clearAllMocks());

describe("GET /users/me", () => {
  it("returns 401 when unauthenticated", async () => {
    const app = buildApp(TEST_CONFIG);
    const res = await app.inject({ method: "GET", url: "/api/users/me" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("returns the authenticated user profile", async () => {
    mockGetUser.mockResolvedValue(MOCK_USER);
    const app = buildApp(TEST_CONFIG);
    await app.ready();
    const token = makeToken(app, { sub: "u1", email: "user@example.com", role: "developer" });
    const res = await app.inject({
      method: "GET",
      url: "/api/users/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: "u1", email: "user@example.com" });
    await app.close();
  });
});

describe("POST /users", () => {
  it("returns 403 when caller is not an admin", async () => {
    const app = buildApp(TEST_CONFIG);
    await app.ready();
    const token = makeToken(app, { sub: "u1", email: "dev@example.com", role: "developer" });
    const res = await app.inject({
      method: "POST",
      url: "/api/users",
      headers: { authorization: `Bearer ${token}` },
      payload: { email: "new@example.com", password: "password123", role: "developer" },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("returns 201 and the new user when called by admin", async () => {
    mockCreateUser.mockResolvedValue(MOCK_USER);
    const app = buildApp(TEST_CONFIG);
    await app.ready();
    const token = makeToken(app, { sub: "a1", email: "admin@example.com", role: "admin" });
    const res = await app.inject({
      method: "POST",
      url: "/api/users",
      headers: { authorization: `Bearer ${token}` },
      payload: { email: "new@example.com", password: "password123", role: "developer" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ id: "u1" });
    await app.close();
  });

  it("returns 400 when required fields are missing", async () => {
    const app = buildApp(TEST_CONFIG);
    await app.ready();
    const token = makeToken(app, { sub: "a1", email: "admin@example.com", role: "admin" });
    const res = await app.inject({
      method: "POST",
      url: "/api/users",
      headers: { authorization: `Bearer ${token}` },
      payload: { email: "new@example.com" },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("propagates 409 from service on duplicate email", async () => {
    mockCreateUser.mockRejectedValue(
      new ApiError(409, "EMAIL_IN_USE", "An account with that email already exists."),
    );
    const app = buildApp(TEST_CONFIG);
    await app.ready();
    const token = makeToken(app, { sub: "a1", email: "admin@example.com", role: "admin" });
    const res = await app.inject({
      method: "POST",
      url: "/api/users",
      headers: { authorization: `Bearer ${token}` },
      payload: { email: "taken@example.com", password: "password123", role: "developer" },
    });
    expect(res.statusCode).toBe(409);
    await app.close();
  });
});

describe("PATCH /users/:userId", () => {
  it("returns 403 when caller is not an admin", async () => {
    const app = buildApp(TEST_CONFIG);
    await app.ready();
    const token = makeToken(app, { sub: "u1", email: "dev@example.com", role: "developer" });
    const res = await app.inject({
      method: "PATCH",
      url: "/api/users/u2",
      headers: { authorization: `Bearer ${token}` },
      payload: { role: "expert" },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("returns 200 and the updated user when called by admin", async () => {
    mockChangeRole.mockResolvedValue({ ...MOCK_USER, role: "expert" });
    const app = buildApp(TEST_CONFIG);
    await app.ready();
    const token = makeToken(app, { sub: "a1", email: "admin@example.com", role: "admin" });
    const res = await app.inject({
      method: "PATCH",
      url: "/api/users/u1",
      headers: { authorization: `Bearer ${token}` },
      payload: { role: "expert" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: "u1", role: "expert" });
    await app.close();
  });

  it("returns 400 when role is missing", async () => {
    const app = buildApp(TEST_CONFIG);
    await app.ready();
    const token = makeToken(app, { sub: "a1", email: "admin@example.com", role: "admin" });
    const res = await app.inject({
      method: "PATCH",
      url: "/api/users/u1",
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("propagates 404 from service when user is not found", async () => {
    mockChangeRole.mockRejectedValue(new ApiError(404, "NOT_FOUND", "User not found."));
    const app = buildApp(TEST_CONFIG);
    await app.ready();
    const token = makeToken(app, { sub: "a1", email: "admin@example.com", role: "admin" });
    const res = await app.inject({
      method: "PATCH",
      url: "/api/users/missing",
      headers: { authorization: `Bearer ${token}` },
      payload: { role: "developer" },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
