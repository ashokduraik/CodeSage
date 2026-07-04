import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("postgres", () => {
  const mockSql = Object.assign(vi.fn(), { end: vi.fn().mockResolvedValue(undefined), json: vi.fn((v) => v) });
  return { default: vi.fn(() => mockSql) };
});

vi.mock("./auth.service", () => ({
  loginUser: vi.fn(),
}));

const { buildApp } = await import("../../http/app");
import { loginUser } from "./auth.service";

const mockLoginUser = vi.mocked(loginUser);

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

const MOCK_RESPONSE = {
  token: "signed-jwt",
  user: {
    id: "u1",
    email: "user@example.com",
    role: "developer" as const,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
};

afterEach(() => vi.clearAllMocks());

describe("POST /auth/login", () => {
  it("returns 200 and a token for valid credentials", async () => {
    mockLoginUser.mockResolvedValue(MOCK_RESPONSE);
    const app = buildApp(TEST_CONFIG);
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "user@example.com", password: "password123" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ token: "signed-jwt", user: { id: "u1" } });
    await app.close();
  });

  it("returns 400 when email is missing", async () => {
    const app = buildApp(TEST_CONFIG);
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { password: "password123" },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("returns 400 when password is missing", async () => {
    const app = buildApp(TEST_CONFIG);
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "user@example.com" },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("propagates 401 from loginUser on invalid credentials", async () => {
    const { ApiError } = await import("../../platform/errors");
    mockLoginUser.mockRejectedValue(
      new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect."),
    );
    const app = buildApp(TEST_CONFIG);
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "user@example.com", password: "wrong" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: { code: "INVALID_CREDENTIALS" } });
    await app.close();
  });
});
