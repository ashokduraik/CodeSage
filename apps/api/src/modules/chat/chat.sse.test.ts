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
});
