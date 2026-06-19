import { describe, it, expect } from "vitest";
import { buildLoggerOptions } from "./logger";
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
