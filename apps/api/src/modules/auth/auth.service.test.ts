import { describe, it, expect, vi, afterEach } from "vitest";
import { hash } from "bcryptjs";

vi.mock("postgres", () => {
  const mockSql = Object.assign(vi.fn(), { end: vi.fn().mockResolvedValue(undefined), json: vi.fn((v) => v) });
  return { default: vi.fn(() => mockSql) };
});

const { buildApp } = await import("../../http/app");
const { loginUser } = await import("./auth.service");
import type { Sql } from "../../platform/db";

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

/** Creates a tagged-template-compatible mock that returns given rows. */
function mockDb(rows: unknown[]): Sql {
  return Object.assign(vi.fn().mockResolvedValue(rows), {
    end: vi.fn(),
    json: (v: unknown) => v,
  }) as unknown as Sql;
}

afterEach(() => vi.clearAllMocks());

describe("loginUser", () => {
  it("returns a token and user profile for valid credentials", async () => {
    const app = buildApp(TEST_CONFIG);
    await app.ready();

    const passwordHash = await hash("password123", 10);
    const db = mockDb([
      {
        id: "u1",
        email: "user@example.com",
        role: "developer",
        password_hash: passwordHash,
        created_at: new Date("2026-01-01T00:00:00Z"),
      },
    ]);

    const result = await loginUser(db, app, "user@example.com", "password123");

    expect(result.token).toBeTruthy();
    expect(result.user.id).toBe("u1");
    expect(result.user.email).toBe("user@example.com");
    expect(result.user.role).toBe("developer");
    expect(result.user.createdAt).toBe("2026-01-01T00:00:00.000Z");

    const [, payloadSegment] = result.token.split(".");
    expect(payloadSegment).toBeDefined();
    const jwtPayload = JSON.parse(
      Buffer.from(payloadSegment as string, "base64url").toString("utf8"),
    ) as { exp: number; iat: number };
    expect(jwtPayload.exp - jwtPayload.iat).toBe(3600);

    await app.close();
  });

  it("throws 401 when the user is not found", async () => {
    const app = buildApp(TEST_CONFIG);
    await app.ready();
    const db = mockDb([]);
    await expect(loginUser(db, app, "ghost@example.com", "anypass")).rejects.toMatchObject({
      statusCode: 401,
      code: "INVALID_CREDENTIALS",
    });
    await app.close();
  });

  it("throws 401 when the password does not match", async () => {
    const app = buildApp(TEST_CONFIG);
    await app.ready();
    const passwordHash = await hash("correct-password", 10);
    const db = mockDb([
      {
        id: "u1",
        email: "user@example.com",
        role: "developer",
        password_hash: passwordHash,
        created_at: new Date(),
      },
    ]);
    await expect(loginUser(db, app, "user@example.com", "wrong-password")).rejects.toMatchObject({
      statusCode: 401,
    });
    await app.close();
  });
});
