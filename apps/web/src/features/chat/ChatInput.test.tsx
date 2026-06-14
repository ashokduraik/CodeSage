import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@/i18n";
import { ChatInput } from "./ChatInput";

afterEach(cleanup);

describe("ChatInput", () => {
  it("sends trimmed text and clears the field on submit", () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} />);
    const field = screen.getByLabelText("Ask about your codebase\u2026") as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "  how does auth work?  " } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(onSend).toHaveBeenCalledWith("how does auth work?");
    expect(field.value).toBe("");
  });

  it("submits on Enter but inserts a newline on Shift+Enter", () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} />);
    const field = screen.getByLabelText("Ask about your codebase\u2026");
    fireEvent.change(field, { target: { value: "question" } });
    fireEvent.keyDown(field, { key: "Enter", shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onSend).toHaveBeenCalledWith("question");
  });

  it("does not send empty or whitespace-only text", () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} />);
    const field = screen.getByLabelText("Ask about your codebase\u2026");
    fireEvent.change(field, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(onSend).not.toHaveBeenCalled();
  });

  it("does not send while disabled", () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} disabled />);
    const field = screen.getByLabelText("Ask about your codebase\u2026");
    fireEvent.change(field, { target: { value: "text" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onSend).not.toHaveBeenCalled();
  });
});
