import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("postgres", () => {
  const mockSql = Object.assign(vi.fn(), { end: vi.fn().mockResolvedValue(undefined), json: vi.fn((v) => v) });
  return { default: vi.fn(() => mockSql) };
});

vi.mock("../../platform/engineClient", () => ({
  postEngineQueryStream: vi.fn(),
}));

vi.mock("./chat.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./chat.service")>();
  return {
    ...actual,
    listConversations: vi.fn(),
    createConversation: vi.fn(),
    getConversation: vi.fn(),
    deleteConversation: vi.fn(),
    listConversationMessages: vi.fn(),
  };
});

const { buildApp } = await import("../../http/app");
import { postEngineQueryStream } from "../../platform/engineClient";
import {
  createConversation,
  deleteConversation,
  getConversation,
  listConversationMessages,
  listConversations,
} from "./chat.service";
import type { JwtPayload } from "../../platform/auth.plugin";

const mockPostEngine = vi.mocked(postEngineQueryStream);
const mockListConversations = vi.mocked(listConversations);
const mockCreateConversation = vi.mocked(createConversation);
const mockGetConversation = vi.mocked(getConversation);
const mockDeleteConversation = vi.mocked(deleteConversation);
const mockListMessages = vi.mocked(listConversationMessages);

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

  it("omits empty prior assistant turns from engine history", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"done"}\n\n'));
        controller.close();
      },
    });
    mockPostEngine.mockResolvedValue(new Response(body, { status: 200 }));

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
            title: "Chat",
          },
        ]);
      }
      if (query.includes("COUNT(*)") && query.includes("messages")) {
        return Promise.resolve([{ count: 2 }]);
      }
      if (query.includes("FROM messages") && query.includes("ORDER BY")) {
        return Promise.resolve([
          {
            id: "m-empty",
            conversation_id: CONVERSATION_ID,
            role: "assistant",
            content: "",
            citations: [],
            metrics: null,
            investigation_trace: null,
            needs_review: false,
            stopped: true,
            created_at: new Date(),
          },
          {
            id: "m-ok",
            conversation_id: CONVERSATION_ID,
            role: "user",
            content: "prior question",
            citations: [],
            metrics: null,
            investigation_trace: null,
            needs_review: false,
            stopped: false,
            created_at: new Date(),
          },
        ]);
      }
      if (query.includes("INSERT INTO messages")) {
        return Promise.resolve([
          {
            id: "m-new",
            conversation_id: CONVERSATION_ID,
            role: "user",
            content: "explain the project",
            citations: null,
            metrics: null,
            investigation_trace: null,
            needs_review: false,
            stopped: false,
            created_at: new Date(),
          },
        ]);
      }
      return Promise.resolve([]);
    });

    const app = buildApp(TEST_CONFIG);
    app.db = sql as never;
    await app.ready();
    const res = await app.inject({
      method: "POST",
      url: "/api/chat/query",
      headers: { authorization: `Bearer ${devToken(app)}` },
      payload: {
        question: "explain the project",
        conversationId: CONVERSATION_ID,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(mockPostEngine).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        history: [{ role: "user", content: "prior question" }],
      }),
      expect.any(AbortSignal),
    );
    const engineBody = mockPostEngine.mock.calls[0]?.[1] as {
      priorEvidence?: unknown;
      history?: unknown[];
    };
    expect(engineBody.priorEvidence).toBeUndefined();
    expect(engineBody.history).toEqual([{ role: "user", content: "prior question" }]);
    await app.close();
  });

  it("sends priorEvidence citations from last grounded assistant to engine", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"done"}\n\n'));
        controller.close();
      },
    });
    mockPostEngine.mockResolvedValue(new Response(body, { status: 200 }));

    const citation = {
      kind: "code",
      repoId: "11111111-1111-1111-1111-111111111111",
      filePath: "src/loan.utils.ts",
      span: { startLine: 12, endLine: 24 },
    };

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
            title: "Chat",
          },
        ]);
      }
      if (query.includes("COUNT(*)") && query.includes("messages")) {
        return Promise.resolve([{ count: 2 }]);
      }
      if (query.includes("FROM messages") && query.includes("ORDER BY")) {
        return Promise.resolve([
          {
            id: "m-user",
            conversation_id: CONVERSATION_ID,
            role: "user",
            content: "How EMI is calculated?",
            citations: null,
            metrics: null,
            investigation_trace: null,
            needs_review: false,
            stopped: false,
            created_at: new Date(),
          },
          {
            id: "m-asst",
            conversation_id: CONVERSATION_ID,
            role: "assistant",
            content: "EMI formula…",
            citations: [citation],
            metrics: null,
            investigation_trace: {
              version: 1,
              evidenceAnchors: [{ filePath: "src/loan.utils.ts", symbol: "calculateEmi" }],
            },
            needs_review: false,
            stopped: false,
            created_at: new Date(),
          },
        ]);
      }
      if (query.includes("INSERT INTO messages")) {
        return Promise.resolve([
          {
            id: "m-new",
            conversation_id: CONVERSATION_ID,
            role: "user",
            content: "I don't understand the second point",
            citations: null,
            metrics: null,
            investigation_trace: null,
            needs_review: false,
            stopped: false,
            created_at: new Date(),
          },
        ]);
      }
      return Promise.resolve([]);
    });

    const app = buildApp(TEST_CONFIG);
    app.db = sql as never;
    await app.ready();
    const res = await app.inject({
      method: "POST",
      url: "/api/chat/query",
      headers: { authorization: `Bearer ${devToken(app)}` },
      payload: {
        question: "I don't understand the second point",
        conversationId: CONVERSATION_ID,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(mockPostEngine).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        history: [
          { role: "user", content: "How EMI is calculated?" },
          { role: "assistant", content: "EMI formula…" },
        ],
        priorEvidence: {
          citations: [citation],
          evidenceAnchors: [{ filePath: "src/loan.utils.ts", symbol: "calculateEmi" }],
        },
      }),
      expect.any(AbortSignal),
    );
    const engineBody = mockPostEngine.mock.calls[0]?.[1] as {
      history?: Array<{ role: string; content: string; citations?: unknown }>;
    };
    expect(engineBody.history?.[1]).toEqual({
      role: "assistant",
      content: "EMI formula…",
    });
    expect(engineBody.history?.[1]).not.toHaveProperty("citations");
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
    expect(res.json()).toMatchObject({
      error: { code: "ENGINE_UNAVAILABLE" },
    });
    await app.close();
  });

  it("emits an SSE error event when the engine stream fails mid-flight", async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.error(new Error("socket closed"));
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
    expect(res.body).toContain('"type":"error"');
    expect(res.body).toContain("STREAM_INTERRUPTED");
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

  it("lists conversations for the authenticated user", async () => {
    mockListConversations.mockResolvedValue([
      {
        id: CONVERSATION_ID,
        title: "Auth",
        mode: "developer",
        projectId: "p1",
        projectName: "demo",
        messageCount: 2,
        lastMessageAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    const app = buildApp(TEST_CONFIG);
    await app.ready();
    const res = await app.inject({
      method: "GET",
      url: "/api/conversations",
      headers: { authorization: `Bearer ${devToken(app)}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()[0]?.title).toBe("Auth");
    await app.close();
  });

  it("creates a conversation", async () => {
    mockCreateConversation.mockResolvedValue({
      id: CONVERSATION_ID,
      title: "New Chat",
      mode: "developer",
      projectId: "p1",
      projectName: "demo",
      messageCount: 0,
      lastMessageAt: null,
    });
    const app = buildApp(TEST_CONFIG);
    await app.ready();
    const res = await app.inject({
      method: "POST",
      url: "/api/conversations",
      headers: { authorization: `Bearer ${devToken(app)}` },
      payload: { projectId: "p1", mode: "developer" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().id).toBe(CONVERSATION_ID);
    await app.close();
  });

  it("returns one conversation by id", async () => {
    mockGetConversation.mockResolvedValue({
      id: CONVERSATION_ID,
      title: "Auth",
      mode: "developer",
      projectId: "p1",
      projectName: "demo",
      messageCount: 1,
      lastMessageAt: "2026-01-01T00:00:00.000Z",
    });
    const app = buildApp(TEST_CONFIG);
    await app.ready();
    const res = await app.inject({
      method: "GET",
      url: `/api/conversations/${CONVERSATION_ID}`,
      headers: { authorization: `Bearer ${devToken(app)}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe(CONVERSATION_ID);
    await app.close();
  });

  it("soft-deletes a conversation", async () => {
    mockDeleteConversation.mockResolvedValue(undefined);
    const app = buildApp(TEST_CONFIG);
    await app.ready();
    const res = await app.inject({
      method: "DELETE",
      url: `/api/conversations/${CONVERSATION_ID}`,
      headers: { authorization: `Bearer ${devToken(app)}` },
    });
    expect(res.statusCode).toBe(204);
    await app.close();
  });

  it("lists messages for a conversation", async () => {
    mockListMessages.mockResolvedValue([
      {
        id: "m1",
        conversationId: CONVERSATION_ID,
        role: "user",
        content: "hello",
        citations: undefined,
        metrics: undefined,
        needsReview: false,
        stopped: false,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    const app = buildApp(TEST_CONFIG);
    await app.ready();
    const res = await app.inject({
      method: "GET",
      url: `/api/conversations/${CONVERSATION_ID}/messages`,
      headers: { authorization: `Bearer ${devToken(app)}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()[0]?.content).toBe("hello");
    await app.close();
  });
});
