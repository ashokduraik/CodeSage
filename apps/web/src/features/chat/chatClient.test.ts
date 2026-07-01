import { describe, it, expect } from "vitest";
import { formatCitationSource, parseChatSseLine } from "./chatClient";

describe("parseChatSseLine", () => {
  it("parses a token chunk", () => {
    const chunk = parseChatSseLine('data: {"type":"token","content":"hi"}');
    expect(chunk?.type).toBe("token");
    expect(chunk?.content).toBe("hi");
  });

  it("returns null for non-data lines", () => {
    expect(parseChatSseLine(": keep-alive")).toBeNull();
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
