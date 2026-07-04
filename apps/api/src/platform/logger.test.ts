import { describe, it, expect, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildLoggerOptions, registerRequestLogging } from "./logger";
import type { AppConfig } from "./config";

/** Minimal config fixture for testing logger options only. */
function cfg(nodeEnv: string, logger: boolean): AppConfig {
  return {
    host: "0.0.0.0",
    port: 3000,
    nodeEnv,
    logger,
    databaseUrl: "",
    jwtSecret: "",
    jwtTtl: "1h",
    encryptionKey: "",
    mockMode: false,
    ragBaseUrl: "http://127.0.0.1:8001",
    webhookBaseUrl: "",
  };
}

describe("buildLoggerOptions", () => {
  it("returns false when logger is disabled", () => {
    expect(buildLoggerOptions(cfg("test", false))).toBe(false);
  });

  it("returns info level in production", () => {
    const opts = buildLoggerOptions(cfg("production", true)) as Record<string, unknown>;
    expect(opts.level).toBe("info");
  });

  it("returns debug level in development", () => {
    const opts = buildLoggerOptions(cfg("development", true)) as Record<string, unknown>;
    expect(opts.level).toBe("debug");
  });

  it("returns debug level in any non-production environment", () => {
    const opts = buildLoggerOptions(cfg("staging", true)) as Record<string, unknown>;
    expect(opts.level).toBe("debug");
  });

  it("level formatter returns label string instead of a numeric code", () => {
    const opts = buildLoggerOptions(cfg("development", true)) as {
      formatters: { level: (label: string) => { level: string } };
    };
    expect(opts.formatters.level("info")).toEqual({ level: "info" });
    expect(opts.formatters.level("error")).toEqual({ level: "error" });
  });

  it("bindings formatter strips pid and retains hostname", () => {
    const opts = buildLoggerOptions(cfg("development", true)) as {
      formatters: { bindings: (b: Record<string, unknown>) => Record<string, unknown> };
    };
    const result = opts.formatters.bindings({ pid: 1234, hostname: "my-host" });
    expect(result).toEqual({ hostname: "my-host" });
    expect(result["pid"]).toBeUndefined();
  });

  it("timestamp produces an ISO 8601 string field", () => {
    const opts = buildLoggerOptions(cfg("development", true)) as {
      timestamp: () => string;
    };
    const raw = opts.timestamp();
    expect(raw).toMatch(/^,"time":"[\d]{4}-[\d]{2}-[\d]{2}T[\d]{2}:[\d]{2}:[\d]{2}/);
  });
});

describe("registerRequestLogging", () => {
  it("registers onRequest and onResponse hooks that log at debug", async () => {
    const debug = vi.fn();
    const app = {
      addHook: vi.fn(),
    } as unknown as FastifyInstance;

    registerRequestLogging(app);

    expect(app.addHook).toHaveBeenCalledTimes(2);
    expect(app.addHook).toHaveBeenCalledWith("onRequest", expect.any(Function));
    expect(app.addHook).toHaveBeenCalledWith("onResponse", expect.any(Function));

    const onRequest = vi.mocked(app.addHook).mock.calls[0][1] as (
      req: { log: { debug: typeof debug }; method: string },
      reply: unknown,
      done: () => void,
    ) => void;
    const onResponse = vi.mocked(app.addHook).mock.calls[1][1] as (
      req: { log: { debug: typeof debug } },
      reply: { statusCode: number; elapsedTime: number },
      done: () => void,
    ) => void;
    const done = vi.fn();
    onRequest({ log: { debug }, method: "GET" }, {}, done);
    expect(debug).toHaveBeenCalledWith(
      expect.objectContaining({ req: expect.objectContaining({ method: "GET" }) }),
      "incoming request",
    );
    debug.mockClear();
    onResponse({ log: { debug } }, { statusCode: 200, elapsedTime: 12.5 }, done);
    expect(debug).toHaveBeenCalledWith(
      { res: { statusCode: 200, elapsedTime: 12.5 }, responseTime: 12.5 },
      "request completed",
    );
    expect(done).toHaveBeenCalledTimes(2);
  });
});
