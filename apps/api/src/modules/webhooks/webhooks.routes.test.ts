import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("postgres", () => {
  const mockSql = Object.assign(vi.fn(), { end: vi.fn().mockResolvedValue(undefined), json: vi.fn((v) => v) });
  return { default: vi.fn(() => mockSql) };
});

vi.mock("./webhooks.service", () => ({
  handlePushWebhook: vi.fn(),
}));

const { buildApp } = await import("../../http/app");
import { handlePushWebhook } from "./webhooks.service";

const mockHandle = vi.mocked(handlePushWebhook);

const TEST_CONFIG = {
  host: "127.0.0.1",
  port: 0,
  nodeEnv: "test",
  logger: false,
  databaseUrl: "postgresql://test:test@localhost/test",
  jwtSecret: "test-secret-32-chars-long-enough!",
  jwtTtl: "3600",
  encryptionKey: Buffer.alloc(32, 1).toString("base64"),
  mockMode: false,
  ragBaseUrl: "http://127.0.0.1:8001",
  webhookBaseUrl: "https://codesage.example.com",
} as const;

afterEach(() => vi.clearAllMocks());

describe("POST /webhooks/:provider", () => {
  it("accepts GitHub webhook without JWT", async () => {
    mockHandle.mockResolvedValue(undefined);
    const app = buildApp(TEST_CONFIG);
    await app.ready();
    const body = JSON.stringify({ ref: "refs/heads/main" });
    const res = await app.inject({
      method: "POST",
      url: "/api/webhooks/github",
      headers: { "content-type": "application/json" },
      payload: body,
    });
    expect(res.statusCode).toBe(204);
    await app.close();
  });

  it("returns 404 for unknown provider", async () => {
    const app = buildApp(TEST_CONFIG);
    await app.ready();
    const res = await app.inject({
      method: "POST",
      url: "/api/webhooks/bitbucket",
      payload: {},
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
