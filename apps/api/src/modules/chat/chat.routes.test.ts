import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("postgres", () => {
  const mockSql = Object.assign(vi.fn(), { end: vi.fn().mockResolvedValue(undefined), json: vi.fn((v) => v) });
  return { default: vi.fn(() => mockSql) };
});

vi.mock("../../platform/ragClient", () => ({
  postRagQueryStream: vi.fn(),
}));

const { buildApp } = await import("../../http/app");
import { postRagQueryStream } from "../../platform/ragClient";
import type { JwtPayload } from "../../platform/auth.plugin";

const mockPostRag = vi.mocked(postRagQueryStream);

const TEST_CONFIG = {
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
} as const;

afterEach(() => vi.clearAllMocks());

function devToken(app: ReturnType<typeof buildApp>): string {
  const p: JwtPayload = { sub: "u1", email: "dev@test.com", role: "developer" };
  return app.jwt.sign(p);
}

describe("POST /chat/query", () => {
  it("returns 401 when unauthenticated", async () => {
    const app = buildApp(TEST_CONFIG);
    const res = await app.inject({
      method: "POST",
      url: "/api/chat/query",
      payload: { question: "hi", projectId: "p1", audience: "developer" },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("returns 400 when required fields are missing", async () => {
    const app = buildApp(TEST_CONFIG);
    await app.ready();
    const res = await app.inject({
      method: "POST",
      url: "/api/chat/query",
      headers: { authorization: `Bearer ${devToken(app)}` },
      payload: { question: "" },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("proxies the SSE stream from RAG", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"done"}\n\n'));
        controller.close();
      },
    });
    mockPostRag.mockResolvedValue(new Response(body, { status: 200 }));

    const app = buildApp(TEST_CONFIG);
    await app.ready();
    const res = await app.inject({
      method: "POST",
      url: "/api/chat/query",
      headers: { authorization: `Bearer ${devToken(app)}` },
      payload: {
        question: "where is auth?",
        projectId: "11111111-1111-1111-1111-111111111111",
        audience: "developer",
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");
    expect(res.body).toContain('"done"');
    await app.close();
  });

  it("returns 502 when RAG is unavailable", async () => {
    mockPostRag.mockRejectedValue(new Error("connection refused"));
    const app = buildApp(TEST_CONFIG);
    await app.ready();
    const res = await app.inject({
      method: "POST",
      url: "/api/chat/query",
      headers: { authorization: `Bearer ${devToken(app)}` },
      payload: {
        question: "where is auth?",
        projectId: "11111111-1111-1111-1111-111111111111",
        audience: "developer",
      },
    });
    expect(res.statusCode).toBe(502);
    await app.close();
  });
});
