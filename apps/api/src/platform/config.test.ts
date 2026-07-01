import { describe, it, expect } from "vitest";
import { loadConfig, normalizeJwtTtl } from "./config";

describe("loadConfig", () => {
  it("uses defaults when env is empty", () => {
    const cfg = loadConfig({});
    expect(cfg.host).toBe("0.0.0.0");
    expect(cfg.port).toBe(3000);
    expect(cfg.nodeEnv).toBe("development");
    expect(cfg.logger).toBe(true);
    expect(cfg.databaseUrl).toBe("");
    expect(cfg.jwtSecret).toBe("dev-secret-change-me");
    expect(cfg.jwtTtl).toBe("1h");
    expect(cfg.encryptionKey).toBe("");
    expect(cfg.mockMode).toBe(false);
    expect(cfg.ragBaseUrl).toBe("http://127.0.0.1:8001");
  });

  it("reads overrides from env", () => {
    const cfg = loadConfig({
      API_HOST: "127.0.0.1",
      API_PORT: "8080",
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://user:pass@db:5432/codesage",
      JWT_SECRET: "supersecret",
      AUTH_TOKEN_TTL: "7200",
      TOKEN_ENC_KEY: "dGVzdC1rZXktMzItYnl0ZXMtbG9uZy1wYWQ=",
    });
    expect(cfg.host).toBe("127.0.0.1");
    expect(cfg.port).toBe(8080);
    expect(cfg.nodeEnv).toBe("production");
    expect(cfg.logger).toBe(true);
    expect(cfg.databaseUrl).toBe("postgresql://user:pass@db:5432/codesage");
    expect(cfg.jwtSecret).toBe("supersecret");
    expect(cfg.jwtTtl).toBe("7200s");
    expect(cfg.encryptionKey).toBe("dGVzdC1rZXktMzItYnl0ZXMtbG9uZy1wYWQ=");
    expect(cfg.mockMode).toBe(false);
  });

  it("disables the logger and sets nodeEnv=test under NODE_ENV=test", () => {
    const cfg = loadConfig({ NODE_ENV: "test" });
    expect(cfg.logger).toBe(false);
    expect(cfg.nodeEnv).toBe("test");
  });

  it("falls back to process.env by default", () => {
    const cfg = loadConfig();
    expect(typeof cfg.port).toBe("number");
  });

  it("enables mockMode when MOCK_MODE=true", () => {
    const cfg = loadConfig({ MOCK_MODE: "true" });
    expect(cfg.mockMode).toBe(true);
  });

  it("leaves mockMode false for any value other than 'true'", () => {
    expect(loadConfig({ MOCK_MODE: "false" }).mockMode).toBe(false);
    expect(loadConfig({ MOCK_MODE: "1" }).mockMode).toBe(false);
    expect(loadConfig({}).mockMode).toBe(false);
  });
});

describe("normalizeJwtTtl", () => {
  it("treats bare numeric strings as seconds", () => {
    expect(normalizeJwtTtl("3600")).toBe("3600s");
    expect(normalizeJwtTtl("7200")).toBe("7200s");
  });

  it("preserves time-span strings", () => {
    expect(normalizeJwtTtl("1h")).toBe("1h");
    expect(normalizeJwtTtl("30m")).toBe("30m");
    expect(normalizeJwtTtl("3600s")).toBe("3600s");
    expect(normalizeJwtTtl(" 1h ")).toBe("1h");
  });
});
