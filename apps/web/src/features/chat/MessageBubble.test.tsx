import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@/i18n";
import type { ChatMessage } from "./chatTypes";
import { MessageBubble } from "./MessageBubble";

afterEach(cleanup);

function message(over: Partial<ChatMessage>): ChatMessage {
  return { id: "m", sessionId: "s", role: "assistant", content: "Hello", ...over };
}

describe("MessageBubble", () => {
  it("renders a user message without citations or review note", () => {
    render(<MessageBubble message={message({ role: "user", content: "Hi there" })} />);
    expect(screen.getByText("Hi there")).toBeTruthy();
    expect(screen.queryByText(/expert review/)).toBeNull();
  });

  it("renders a confident assistant message with citations", () => {
    render(
      <MessageBubble
        message={message({ confidence: 0.9, sources: ["acme/web/src/index.ts"] })}
      />,
    );
    expect(screen.getByText("acme/web/src/index.ts")).toBeTruthy();
    expect(screen.queryByText(/expert review/)).toBeNull();
  });

  it("flags a low-confidence assistant message for expert review", () => {
    render(<MessageBubble message={message({ confidence: 0.5, sources: [] })} />);
    expect(screen.getByText("Low confidence \u2014 sent for expert review")).toBeTruthy();
  });

  it("handles an assistant message without confidence or sources", () => {
    render(<MessageBubble message={message({})} />);
    expect(screen.getByText("Hello")).toBeTruthy();
    expect(screen.queryByText(/expert review/)).toBeNull();
  });

  it("renders the metrics line when metrics are present", () => {
    render(
      <MessageBubble
        message={message({
          metrics: {
            contextChunks: 3,
            contextTokens: 2100,
            maxContextTokens: 32768,
            totalTokens: 950,
            tokensPerSecond: 24.6,
          },
        })}
      />,
    );
    expect(screen.getByText(/950 tokens/)).toBeTruthy();
    expect(screen.getByText(/tok\/s/)).toBeTruthy();
    expect(screen.queryByText(/ctx/)).toBeNull();
    expect(screen.queryByText(/chunks/)).toBeNull();
  });

  it("dedupes repeated citation file paths", () => {
    render(
      <MessageBubble
        message={message({
          confidence: 0.9,
          sources: [
            "src/app/pages/calculation-logic/calculation-logic.page.ts",
            "src/app/pages/calculation-logic/calculation-logic.page.ts",
            "src/app/pages/emi-calculator/emi-calculator.page.ts",
          ],
        })}
      />,
    );
    expect(screen.getAllByText("src/app/pages/calculation-logic/calculation-logic.page.ts")).toHaveLength(1);
    expect(screen.getByText("src/app/pages/emi-calculator/emi-calculator.page.ts")).toBeTruthy();
  });

  it("omits the metrics line when metrics are absent", () => {
    render(<MessageBubble message={message({})} />);
    expect(screen.queryByText(/tok\/s/)).toBeNull();
  });
});
