import { describe, it, expect, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app";

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("buildApp", () => {
  it("serves GET /health", async () => {
    app = buildApp({ host: "127.0.0.1", port: 0, logger: false });
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok", service: "api" });
  });

  it("builds with the default config", async () => {
    // NODE_ENV is "test" under vitest, so the default config disables the logger.
    app = buildApp();
    await app.ready();
    expect(app.hasRoute({ method: "GET", url: "/health" })).toBe(true);
  });
});
