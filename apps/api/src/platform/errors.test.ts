import { describe, it, expect, vi } from "vitest";
import { ApiError, canSendJsonError } from "./errors";
import type { FastifyReply } from "fastify";

vi.mock('postgres', () => {
  const mockSql = Object.assign(vi.fn(), { end: vi.fn().mockResolvedValue(undefined) });
  return { default: vi.fn(() => mockSql) };
});

const { buildApp } = await import("../http/app");

/** Shared test config: no listening, no logging, fake DB URL (no real connection made). */
const TEST_CONFIG = {
  host: "127.0.0.1",
  port: 0,
  nodeEnv: "test",
  logger: false,
  databaseUrl: "postgresql://test:test@localhost:5432/test",
  jwtSecret: "test-secret-32-chars-long-enough!",
  jwtTtl: "3600",
  encryptionKey: "",
  mockMode: false,
  engineBaseUrl: "http://127.0.0.1:8001",
  webhookBaseUrl: "",
  workerStaleJobSeconds: 600,
} as const;

describe("ApiError", () => {
  it("constructs with statusCode, code, and message", () => {
    const err = new ApiError(400, "VALIDATION_ERROR", "email is required");
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.message).toBe("email is required");
    expect(err.details).toBeUndefined();
    expect(err.name).toBe("ApiError");
    expect(err).toBeInstanceOf(Error);
  });

  it("stores optional details when provided", () => {
    const details = { field: "email" };
    const err = new ApiError(400, "VALIDATION_ERROR", "invalid", details);
    expect(err.details).toEqual(details);
  });
});

describe("canSendJsonError", () => {
  it("returns false when headers were already sent", () => {
    const reply = {
      sent: false,
      raw: { headersSent: true, writableEnded: false },
    } as unknown as FastifyReply;
    expect(canSendJsonError(reply)).toBe(false);
  });

  it("returns false when the reply was already sent or ended", () => {
    expect(
      canSendJsonError({
        sent: true,
        raw: { headersSent: false, writableEnded: false },
      } as unknown as FastifyReply),
    ).toBe(false);
    expect(
      canSendJsonError({
        sent: false,
        raw: { headersSent: false, writableEnded: true },
      } as unknown as FastifyReply),
    ).toBe(false);
  });

  it("returns true when a JSON body can still be written", () => {
    expect(
      canSendJsonError({
        sent: false,
        raw: { headersSent: false, writableEnded: false },
      } as unknown as FastifyReply),
    ).toBe(true);
  });
});

describe("registerErrorHandler (integration via buildApp)", () => {
  it("returns 404 NOT_FOUND for unknown routes", async () => {
    const app = buildApp(TEST_CONFIG);
    const res = await app.inject({ method: "GET", url: "/nonexistent" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
    await app.close();
  });

  it("returns 500 INTERNAL_ERROR for unhandled generic errors", async () => {
    const app = buildApp(TEST_CONFIG);
    app.get("/boom", async () => {
      throw new Error("something broke");
    });
    const res = await app.inject({ method: "GET", url: "/boom" });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toMatchObject({
      error: { code: "INTERNAL_ERROR", message: "Internal server error" },
    });
    expect(res.json().error.message).not.toBe("something broke");
    await app.close();
  });

  it("preserves ApiError statusCode, code, message, and details", async () => {
    const app = buildApp(TEST_CONFIG);
    app.get("/custom", async () => {
      throw new ApiError(422, "INVALID_PAYLOAD", "bad data", { field: "x" });
    });
    const res = await app.inject({ method: "GET", url: "/custom" });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({
      error: { code: "INVALID_PAYLOAD", message: "bad data", details: { field: "x" } },
    });
    await app.close();
  });

  it("returns REQUEST_ERROR code for non-ApiError 4xx errors", async () => {
    const app = buildApp(TEST_CONFIG);
    app.get("/badreq", async () => {
      const err = Object.assign(new Error("bad request"), { statusCode: 400 });
      throw err;
    });
    const res = await app.inject({ method: "GET", url: "/badreq" });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: "REQUEST_ERROR" } });
    await app.close();
  });
});
