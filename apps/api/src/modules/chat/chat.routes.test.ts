import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("postgres", () => {
  const mockSql = Object.assign(vi.fn(), { end: vi.fn().mockResolvedValue(undefined), json: vi.fn((v) => v) });
  return { default: vi.fn(() => mockSql) };
});

vi.mock("../../platform/engineClient", () => ({
  postEngineQueryStream: vi.fn(),
}));

const { buildApp } = await import("../../http/app");
import { postEngineQueryStream } from "../../platform/engineClient";
import type { JwtPayload } from "../../platform/auth.plugin";

const mockPostEngine = vi.mocked(postEngineQueryStream);

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
  engineBaseUrl: "http://127.0.0.1:8001",
  webhookBaseUrl: "",
  workerStaleJobSeconds: 600,
} as const;

const CONVERSATION_ID = "22222222-2222-2222-2222-222222222222";

afterEach(() => vi.clearAllMocks());

function devToken(app: ReturnType<typeof buildApp>): string {
  const p: JwtPayload = { sub: "u1", email: "dev@test.com", role: "developer" };
  return app.jwt.sign(p);
}

function mockDbForChatQuery() {
  const sql = vi.fn() as ReturnType<typeof vi.fn> & { json: (v: unknown) => unknown };
  sql.json = (v) => v;

  sql.mockImplementation((strings: TemplateStringsArray) => {
    const query = strings.join(" ");
    if (query.includes("FROM conversations") && query.includes("user_id")) {
      return Promise.resolve([
        {
          id: CONVERSATION_ID,
          project_id: "11111111-1111-1111-1111-111111111111",
          user_id: "u1",
          audience: "developer",
          title: null,
        },
      ]);
    }
    if (query.includes("COUNT(*)") && query.includes("messages")) {
      return Promise.resolve([{ count: 0 }]);
    }
    if (query.includes("FROM messages") && query.includes("ORDER BY")) {
      return Promise.resolve([]);
    }
    if (query.includes("INSERT INTO messages")) {
      return Promise.resolve([
        {
          id: "m1",
          conversation_id: CONVERSATION_ID,
          role: "user",
          content: "where is auth?",
          citations: null,
          metrics: null,
          needs_review: false,
          stopped: false,
          created_at: new Date(),
        },
      ]);
    }
    if (query.includes("UPDATE conversations")) {
      return Promise.resolve([]);
    }
    return Promise.resolve([]);
  });

  return sql;
}

describe("POST /chat/query", () => {
  it("returns 401 when unauthenticated", async () => {
    const app = buildApp(TEST_CONFIG);
    const res = await app.inject({
      method: "POST",
      url: "/api/chat/query",
      payload: { question: "hi", conversationId: CONVERSATION_ID },
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

  it("proxies the SSE stream from the engine and passes an abort signal", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"done"}\n\n'));
        controller.close();
      },
    });
    mockPostEngine.mockResolvedValue(new Response(body, { status: 200 }));

    const app = buildApp(TEST_CONFIG);
    app.db = mockDbForChatQuery() as never;
    await app.ready();
    const res = await app.inject({
      method: "POST",
      url: "/api/chat/query",
      headers: { authorization: `Bearer ${devToken(app)}` },
      payload: {
        question: "where is auth?",
        conversationId: CONVERSATION_ID,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");
    expect(res.body).toContain('"done"');
    expect(mockPostEngine).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        question: "where is auth?",
        generateTitle: true,
        history: undefined,
      }),
      expect.any(AbortSignal),
    );
    await app.close();
  });

  it("forwards CORS headers onto the raw SSE response", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"done"}\n\n'));
        controller.close();
      },
    });
    mockPostEngine.mockResolvedValue(new Response(body, { status: 200 }));

    const app = buildApp(TEST_CONFIG);
    app.db = mockDbForChatQuery() as never;
    await app.ready();
    const res = await app.inject({
      method: "POST",
      url: "/api/chat/query",
      headers: {
        authorization: `Bearer ${devToken(app)}`,
        origin: "http://localhost:5173",
      },
      payload: {
        question: "where is auth?",
        conversationId: CONVERSATION_ID,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    await app.close();
  });

  it("returns 502 when the engine is unavailable", async () => {
    mockPostEngine.mockRejectedValue(new Error("connection refused"));
    const app = buildApp(TEST_CONFIG);
    app.db = mockDbForChatQuery() as never;
    await app.ready();
    const res = await app.inject({
      method: "POST",
      url: "/api/chat/query",
      headers: { authorization: `Bearer ${devToken(app)}` },
      payload: {
        question: "where is auth?",
        conversationId: CONVERSATION_ID,
      },
    });
    expect(res.statusCode).toBe(502);
    await app.close();
  });

  it("returns 404 when the conversation is not owned by the user", async () => {
    const sql = vi.fn().mockResolvedValue([]);
    const app = buildApp(TEST_CONFIG);
    app.db = sql as never;
    await app.ready();
    const res = await app.inject({
      method: "POST",
      url: "/api/chat/query",
      headers: { authorization: `Bearer ${devToken(app)}` },
      payload: {
        question: "where is auth?",
        conversationId: CONVERSATION_ID,
      },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe("conversation routes", () => {
  it("returns 401 for unauthenticated conversation list", async () => {
    const app = buildApp(TEST_CONFIG);
    const res = await app.inject({ method: "GET", url: "/api/conversations" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});
