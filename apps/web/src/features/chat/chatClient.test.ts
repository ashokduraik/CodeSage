import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  deleteConversation,
  formatCitationSource,
  parseChatSseLine,
  streamChatQuery,
} from "./chatClient";

vi.mock("@/shared/lib/apiClient", () => ({
  apiFetch: vi.fn(),
}));

vi.mock("@/shared/lib/authTokenStorage", () => ({
  getAuthToken: vi.fn(() => "test-token"),
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
              'data: {"type":"token","content":"Answer"}\n\n',
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

  it("throws when the API returns a non-OK status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 502 })));
    await expect(
      streamChatQuery({
        conversationId: "11111111-1111-1111-1111-111111111111",
        question: "hi",
      }),
    ).rejects.toThrow(/502/);
  });

  it("captures a metrics chunk from the stream", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'data: {"type":"token","content":"Answer"}\n\n' +
              'data: {"type":"metrics","metrics":{"contextChunks":3,"contextTokens":800,"maxContextTokens":32768,"totalTokens":950,"tokensPerSecond":24.6}}\n\n',
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
