import { describe, it, expect } from "vitest";
import { loadConfig } from "./config";

describe("loadConfig", () => {
  it("uses defaults when env is empty", () => {
    const cfg = loadConfig({});
    expect(cfg.host).toBe("0.0.0.0");
    expect(cfg.port).toBe(3000);
    expect(cfg.logger).toBe(true);
  });

  it("reads overrides from env", () => {
    const cfg = loadConfig({ API_HOST: "127.0.0.1", API_PORT: "8080", NODE_ENV: "production" });
    expect(cfg.host).toBe("127.0.0.1");
    expect(cfg.port).toBe(8080);
    expect(cfg.logger).toBe(true);
  });

  it("disables the logger under NODE_ENV=test", () => {
    const cfg = loadConfig({ NODE_ENV: "test" });
    expect(cfg.logger).toBe(false);
  });

  it("falls back to process.env by default", () => {
    const cfg = loadConfig();
    expect(typeof cfg.port).toBe("number");
  });
});
