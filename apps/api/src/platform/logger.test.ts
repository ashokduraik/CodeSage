import { describe, it, expect } from "vitest";
import { buildLoggerOptions } from "./logger";
import type { AppConfig } from "./config";

/** Minimal config fixture for testing logger options only. */
function cfg(nodeEnv: string, logger: boolean): AppConfig {
  return { host: "0.0.0.0", port: 3000, nodeEnv, logger };
}

describe("buildLoggerOptions", () => {
  it("returns false when logger is disabled", () => {
    expect(buildLoggerOptions(cfg("test", false))).toBe(false);
  });

  it("returns info level in production", () => {
    expect(buildLoggerOptions(cfg("production", true))).toEqual({ level: "info" });
  });

  it("returns debug level in development", () => {
    expect(buildLoggerOptions(cfg("development", true))).toEqual({ level: "debug" });
  });

  it("returns debug level in any non-production environment", () => {
    expect(buildLoggerOptions(cfg("staging", true))).toEqual({ level: "debug" });
  });
});
