import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  deleteConversation,
  formatCitationSource,
  parseChatSseLine,
  streamChatQuery,
} from "./chatClient";

vi.mock("@/shared/lib/apiClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/lib/apiClient")>();
  return {
    ...actual,
    apiFetch: vi.fn(),
  };
});

vi.mock("@/shared/lib/authTokenStorage", () => ({
  getAuthToken: vi.fn(() => "test-token"),
}));

vi.mock("@/shared/lib/unauthorizedHandler", () => ({
  notifyUnauthorized: vi.fn(),
}));

import { apiFetch } from "@/shared/lib/apiClient";
const mockFetch = vi.mocked(apiFetch);

describe("parseChatSseLine", () => {
  it("parses a token chunk", () => {
    const chunk = parseChatSseLine('data: {"type":"token","content":"hi"}');
    expect(chunk?.type).toBe("token");
    expect(chunk?.content).toBe("hi");
  });

  it("parses a title chunk", () => {
    const chunk = parseChatSseLine('data: {"type":"title","content":"Auth flow"}');
    expect(chunk?.type).toBe("title");
    expect(chunk?.content).toBe("Auth flow");
  });

  it("returns null for non-data lines", () => {
    expect(parseChatSseLine(": keep-alive")).toBeNull();
    expect(parseChatSseLine("")).toBeNull();
    expect(parseChatSseLine("data:")).toBeNull();
  });
});

describe("streamChatQuery", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("aggregates tokens, citations, title, and abstain from SSE", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'data: {"type":"title","content":"Auth flow"}\n\n' +
              'data: {"type":"citation","citation":{"kind":"code","repoId":"r1","filePath":"src/auth.ts"}}\n\n' +
              'data: {"type":"token","content":"Answer"}\n\n' +
              'data: {"type":"done"}\n\n',
          ),
        );
        controller.close();
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(body, { status: 200 })),
    );

    const result = await streamChatQuery({
      conversationId: "11111111-1111-1111-1111-111111111111",
      question: "where is auth?",
    });

    expect(result.title).toBe("Auth flow");
    expect(result.content).toBe("Answer");
    expect(result.sources).toEqual(["src/auth.ts"]);
    expect(result.needsReview).toBe(false);
    expect(result.aborted).toBe(false);
  });

  it("ignores tool_start and tool_result while still aggregating tokens and citations", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'data: {"type":"tool_start","tool":{"name":"search_hybrid","iteration":1,"args":{"query":"auth"}}}\n\n' +
              'data: {"type":"tool_result","tool":{"name":"search_hybrid","iteration":1,"hitCount":2,"truncated":false,"durationMs":40}}\n\n' +
              'data: {"type":"citation","citation":{"kind":"code","repoId":"r1","filePath":"src/auth.ts"}}\n\n' +
              'data: {"type":"token","content":"Auth lives in "}\n\n' +
              'data: {"type":"token","content":"src/auth.ts"}\n\n' +
              'data: {"type":"done"}\n\n',
          ),
        );
        controller.close();
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status: 200 })));

    const onToolEvent = vi.fn();
    const result = await streamChatQuery(
      {
        conversationId: "11111111-1111-1111-1111-111111111111",
        question: "where is auth?",
      },
      { onToolEvent },
    );

    expect(result.content).toBe("Auth lives in src/auth.ts");
    expect(result.sources).toEqual(["src/auth.ts"]);
    expect(result.needsReview).toBe(false);
    expect(onToolEvent).toHaveBeenCalledTimes(2);
    expect(onToolEvent).toHaveBeenNthCalledWith(
      1,
      "tool_start",
      expect.objectContaining({ name: "search_hybrid", iteration: 1 }),
    );
    expect(onToolEvent).toHaveBeenNthCalledWith(
      2,
      "tool_result",
      expect.objectContaining({ name: "search_hybrid", hitCount: 2 }),
    );
  });

  it("throws ApiClientError with parsed code and message on non-OK status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ error: { code: "ENGINE_UNAVAILABLE", message: "fetch failed" } }),
            { status: 502, headers: { "Content-Type": "application/json" } },
          ),
        ),
      ),
    );
    await expect(
      streamChatQuery({
        conversationId: "11111111-1111-1111-1111-111111111111",
        question: "hi",
      }),
    ).rejects.toMatchObject({
      name: "ApiClientError",
      status: 502,
      code: "ENGINE_UNAVAILABLE",
      message: "fetch failed",
    });
  });

  it("throws ApiClientError with defaults when the error body is not JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("oops", { status: 502 })));
    await expect(
      streamChatQuery({
        conversationId: "11111111-1111-1111-1111-111111111111",
        question: "hi",
      }),
    ).rejects.toMatchObject({
      name: "ApiClientError",
      status: 502,
      code: "REQUEST_ERROR",
    });
  });

  it("throws when the response is OK but has no body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: null,
        json: async () => ({}),
      }),
    );
    await expect(
      streamChatQuery({
        conversationId: "11111111-1111-1111-1111-111111111111",
        question: "hi",
      }),
    ).rejects.toMatchObject({
      code: "ENGINE_UNAVAILABLE",
    });
  });

  it("captures a metrics chunk from the stream", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'data: {"type":"token","content":"Answer"}\n\n' +
              'data: {"type":"metrics","metrics":{"contextChunks":3,"contextTokens":800,"maxContextTokens":32768,"totalTokens":950,"tokensPerSecond":24.6}}\n\n' +
              'data: {"type":"done"}\n\n',
          ),
        );
        controller.close();
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status: 200 })));

    const result = await streamChatQuery({
      conversationId: "11111111-1111-1111-1111-111111111111",
      question: "where is auth?",
    });

    expect(result.metrics?.contextChunks).toBe(3);
    expect(result.metrics?.maxContextTokens).toBe(32768);
    expect(result.metrics?.tokensPerSecond).toBe(24.6);
  });

  it("marks abstain chunks as needsReview", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode('data: {"type":"abstain","content":"Not certain"}\n\n'),
        );
        controller.close();
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(body, { status: 200 })),
    );

    const result = await streamChatQuery({
      conversationId: "11111111-1111-1111-1111-111111111111",
      question: "unknown?",
    });
    expect(result.content).toBe("Not certain");
    expect(result.needsReview).toBe(true);
  });

  it("throws STREAM_INTERRUPTED when the stream ends without a terminal event", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"token","content":"partial"}\n\n'));
        controller.close();
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status: 200 })));

    await expect(
      streamChatQuery({
        conversationId: "11111111-1111-1111-1111-111111111111",
        question: "hi",
      }),
    ).rejects.toMatchObject({
      code: "STREAM_INTERRUPTED",
    });
  });

  it("throws ApiClientError when an error SSE chunk arrives", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'data: {"type":"error","code":"ENGINE_ERROR","content":"generator failed"}\n\n',
          ),
        );
        controller.close();
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status: 200 })));

    await expect(
      streamChatQuery({
        conversationId: "11111111-1111-1111-1111-111111111111",
        question: "hi",
      }),
    ).rejects.toMatchObject({
      code: "ENGINE_ERROR",
      message: "generator failed",
    });
  });

  it("returns aborted when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("Aborted", "AbortError")),
    );

    const result = await streamChatQuery(
      {
        conversationId: "11111111-1111-1111-1111-111111111111",
        question: "stop me",
      },
      { signal: controller.signal },
    );
    expect(result.aborted).toBe(true);
  });
});

describe("formatCitationSource", () => {
  it("returns the file path", () => {
    expect(
      formatCitationSource({
        kind: "code",
        repoId: "r1",
        filePath: "src/auth.ts",
      }),
    ).toBe("src/auth.ts");
  });
});

describe("deleteConversation", () => {
  beforeEach(() => {
    mockFetch.mockResolvedValue(undefined);
  });

  it("calls DELETE /conversations/:id", async () => {
    await deleteConversation("11111111-1111-1111-1111-111111111111");
    expect(mockFetch).toHaveBeenCalledWith("/conversations/11111111-1111-1111-1111-111111111111", {
      method: "DELETE",
    });
  });
});
