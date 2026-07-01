import { describe, it, expect, afterEach, vi } from "vitest";
import type { FastifyInstance } from "fastify";

vi.mock("postgres", () => {
  const mockEnd = vi.fn().mockResolvedValue(undefined);
  const mockSql = Object.assign(vi.fn(), { end: mockEnd });
  return { default: vi.fn(() => mockSql) };
});

const { buildApp } = await import("./app");

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
  ragBaseUrl: "http://127.0.0.1:8001",
} as const;

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("registerRoutes", () => {
  it("registers core domain routes under the /api prefix", async () => {
    app = buildApp(TEST_CONFIG);
    await app.ready();

    const routes = [
      { method: "GET" as const, url: "/api/health" },
      { method: "POST" as const, url: "/api/auth/login" },
      { method: "GET" as const, url: "/api/projects" },
      { method: "GET" as const, url: "/api/dashboard/stats" },
    ];

    for (const route of routes) {
      expect(app.hasRoute(route)).toBe(true);
    }
  });
});
