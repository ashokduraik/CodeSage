import { describe, it, expect, vi } from "vitest";
import { ApiError } from "./errors";

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
    expect(res.json()).toMatchObject({ error: { code: "INTERNAL_ERROR" } });
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

