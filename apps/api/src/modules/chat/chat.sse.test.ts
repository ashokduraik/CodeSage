import { describe, it, expect } from "vitest";
import {
  applyChatChunk,
  createStreamAccumulator,
  feedSseBytes,
  formatSseErrorEvent,
  parseChatSseLine,
} from "./chat.sse";

describe("chat.sse", () => {
  it("parses token chunks from SSE lines", () => {
    const chunk = parseChatSseLine('data: {"type":"token","content":"hi"}');
    expect(chunk?.type).toBe("token");
    expect(chunk?.content).toBe("hi");
  });

  it("returns null for non-data and empty data lines", () => {
    expect(parseChatSseLine(": keep-alive")).toBeNull();
    expect(parseChatSseLine("data:")).toBeNull();
    expect(parseChatSseLine("data:   ")).toBeNull();
  });

  it("formats an SSE error event", () => {
    expect(formatSseErrorEvent("ENGINE_ERROR", "boom")).toBe(
      'data: {"type":"error","code":"ENGINE_ERROR","content":"boom"}\n\n',
    );
  });

  it("parses tool_start chunks from SSE lines", () => {
    const chunk = parseChatSseLine(
      'data: {"type":"tool_start","tool":{"name":"search_hybrid","iteration":1,"args":{"query":"getMinEmi"}}}',
    );
    expect(chunk?.type).toBe("tool_start");
    expect(chunk?.tool?.name).toBe("search_hybrid");
    expect(chunk?.tool?.iteration).toBe(1);
  });

  it("applyChatChunk ignores tool_start without mutating content", () => {
    const acc = createStreamAccumulator();
    applyChatChunk(acc, { type: "token", content: "Hello" });
    applyChatChunk(acc, {
      type: "tool_start",
      tool: {
        name: "search_hybrid",
        iteration: 1,
        args: { query: "getMinEmi" },
      },
    });
    expect(acc.content).toBe("Hello");
    expect(acc.citations).toHaveLength(0);
    expect(acc.completed).toBe(false);
    expect(acc.needsReview).toBe(false);
    expect(acc.investigationTrace).toBeUndefined();
  });

  it("applyChatChunk ignores tool_result", () => {
    const acc = createStreamAccumulator();
    applyChatChunk(acc, { type: "token", content: "partial" });
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
    expect(acc.content).toBe("partial");
    expect(acc.completed).toBe(false);
    expect(acc.metrics).toBeUndefined();
  });

  it("passes through agent metrics fields without stripping them", () => {
    const acc = createStreamAccumulator();
    applyChatChunk(acc, {
      type: "metrics",
      metrics: {
        contextChunks: 4,
        agentIterations: 2,
        evidenceConfidence: 0.85,
        toolCallCount: 3,
      },
    });
    expect(acc.metrics?.contextChunks).toBe(4);
    expect(acc.metrics?.agentIterations).toBe(2);
    expect(acc.metrics?.evidenceConfidence).toBe(0.85);
    expect(acc.metrics?.toolCallCount).toBe(3);
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

  it("sets title, done, and abstain defaults", () => {
    const titled = createStreamAccumulator();
    applyChatChunk(titled, { type: "title", content: "Auth flow" });
    applyChatChunk(titled, { type: "done" });
    expect(titled.title).toBe("Auth flow");
    expect(titled.completed).toBe(true);

    const abstained = createStreamAccumulator();
    applyChatChunk(abstained, { type: "abstain" });
    expect(abstained.content).toBe(
      "Not certain — no sufficiently relevant code was retrieved.",
    );
    expect(abstained.needsReview).toBe(true);
    expect(abstained.completed).toBe(true);

    const customAbstain = createStreamAccumulator();
    applyChatChunk(customAbstain, { type: "abstain", content: "No match" });
    expect(customAbstain.content).toBe("No match");
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

  it("defaults error code and message when omitted", () => {
    const acc = createStreamAccumulator();
    applyChatChunk(acc, { type: "error" });
    expect(acc.streamError).toEqual({
      code: "STREAM_INTERRUPTED",
      message: "The answer stream was interrupted.",
    });
  });
});
