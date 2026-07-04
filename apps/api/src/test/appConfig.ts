import type { AppConfig } from "../platform/config";

/** Shared AppConfig for HTTP route and middleware unit tests. */
export const TEST_APP_CONFIG: AppConfig = {
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
};

/** AppConfig with a public webhook base URL for webhook route tests. */
export const TEST_WEBHOOK_APP_CONFIG: AppConfig = {
  ...TEST_APP_CONFIG,
  webhookBaseUrl: "https://codesage.example.com",
};
