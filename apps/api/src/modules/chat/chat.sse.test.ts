import { describe, it, expect } from "vitest";
import {
  applyChatChunk,
  createStreamAccumulator,
  feedSseBytes,
  parseChatSseLine,
} from "./chat.sse";

describe("chat.sse", () => {
  it("parses token chunks from SSE lines", () => {
    const chunk = parseChatSseLine('data: {"type":"token","content":"hi"}');
    expect(chunk?.type).toBe("token");
    expect(chunk?.content).toBe("hi");
  });

  it("parses tool_start chunks from SSE lines", () => {
    const chunk = parseChatSseLine(
      'data: {"type":"tool_start","tool":{"name":"search_hybrid","iteration":1,"args":{"query":"getMinEmi"}}}',
    );
    expect(chunk?.type).toBe("tool_start");
    expect(chunk?.tool?.name).toBe("search_hybrid");
    expect(chunk?.tool?.iteration).toBe(1);
  });

  it("parses tool_result chunks without mutating answer content", () => {
    const acc = createStreamAccumulator();
    applyChatChunk(acc, {
      type: "tool_result",
      tool: {
        name: "search_symbols",
        iteration: 1,
        hitCount: 3,
        truncated: false,
        durationMs: 12,
      },
    });
    expect(acc.content).toBe("");
    expect(acc.completed).toBe(false);
  });

  it("accumulates tokens and citations", () => {
    const acc = createStreamAccumulator();
    applyChatChunk(acc, { type: "token", content: "Hello" });
    applyChatChunk(acc, {
      type: "citation",
      citation: { kind: "code", repoId: "r1", filePath: "src/a.ts" },
    });
    expect(acc.content).toBe("Hello");
    expect(acc.citations).toHaveLength(1);
  });

  it("feeds raw bytes into the accumulator", () => {
    const acc = createStreamAccumulator();
    const encoder = new TextEncoder();
    const remainder = feedSseBytes(
      acc,
      "",
      encoder.encode('data: {"type":"token","content":"x"}\n\n'),
    );
    expect(acc.content).toBe("x");
    expect(remainder).toBe("");
  });

  it("marks error chunks as completed with streamError", () => {
    const acc = createStreamAccumulator();
    applyChatChunk(acc, {
      type: "error",
      code: "ENGINE_ERROR",
      content: "boom",
    });
    expect(acc.completed).toBe(true);
    expect(acc.streamError).toEqual({ code: "ENGINE_ERROR", message: "boom" });
  });
});
