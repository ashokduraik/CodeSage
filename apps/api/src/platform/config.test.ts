import { describe, it, expect } from "vitest";
import { loadConfig } from "./config";

describe("loadConfig", () => {
  it("uses defaults when env is empty", () => {
    const cfg = loadConfig({});
    expect(cfg.host).toBe("0.0.0.0");
    expect(cfg.port).toBe(3000);
    expect(cfg.nodeEnv).toBe("development");
    expect(cfg.logger).toBe(true);
    expect(cfg.databaseUrl).toBe("");
    expect(cfg.jwtSecret).toBe("dev-secret-change-me");
    expect(cfg.jwtTtl).toBe("3600");
    expect(cfg.encryptionKey).toBe("");
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
    expect(cfg.jwtTtl).toBe("7200");
    expect(cfg.encryptionKey).toBe("dGVzdC1rZXktMzItYnl0ZXMtbG9uZy1wYWQ=");
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
});
