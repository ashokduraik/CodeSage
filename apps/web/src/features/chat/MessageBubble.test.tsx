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
});
