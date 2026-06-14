import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@/i18n";
import { resetMockStore } from "@/shared/mock";
import { Chat } from "./Chat";

beforeAll(() => {
  // jsdom does not implement scrollIntoView; the page calls it on new messages.
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    value: vi.fn(),
    writable: true,
  });
});

beforeEach(() => resetMockStore());
afterEach(cleanup);

function renderChat(route: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/chat" element={<Chat />} />
          <Route path="/chat/:sessionId" element={<Chat />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Chat", () => {
  it("shows a spinner while sessions load", () => {
    renderChat("/chat");
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("shows the empty hero when no conversation is selected", async () => {
    renderChat("/chat");
    expect(await screen.findByText("Ask CodeSage")).toBeTruthy();
    expect(screen.getByText("Select or start a conversation")).toBeTruthy();
  });

  it("renders the selected conversation with its messages", async () => {
    renderChat("/chat/s1");
    // Title appears in both sidebar and header; assert text unique to the reply.
    expect(await screen.findByText(/validates credentials/)).toBeTruthy();
  });

  it("prompts for a first question on an empty conversation without a project", async () => {
    renderChat("/chat/s3");
    expect(await screen.findByText("Ask your first question about this project.")).toBeTruthy();
  });

  it("toggles the conversation sidebar", async () => {
    renderChat("/chat/s1");
    await screen.findByText(/validates credentials/);
    fireEvent.click(screen.getByRole("button", { name: "Toggle conversation list" }));
    expect(screen.getByRole("button", { name: "Toggle conversation list" })).toBeTruthy();
  });

  it("sends a message and appends it to the thread", async () => {
    renderChat("/chat/s1");
    await screen.findByText(/validates credentials/);
    fireEvent.change(screen.getByLabelText("Ask about your codebase\u2026"), {
      target: { value: "What about logout?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(await screen.findByText("What about logout?")).toBeTruthy();
  });

  it("opens the new-chat dialog from the hero call-to-action", async () => {
    renderChat("/chat");
    fireEvent.click(await screen.findByRole("button", { name: "Start a Conversation" }));
    expect(await screen.findByText("New Conversation")).toBeTruthy();
  });

  it("opens the new-chat dialog from the mobile header button", async () => {
    renderChat("/chat");
    await screen.findByText("Ask CodeSage");
    const newChatButtons = screen.getAllByRole("button", { name: "New Chat" });
    fireEvent.click(newChatButtons[newChatButtons.length - 1] as HTMLElement);
    expect(await screen.findByText("New Conversation")).toBeTruthy();
  });

  it("creates a new conversation and navigates to it", async () => {
    renderChat("/chat");
    await screen.findByText("Ask CodeSage");
    const newChatButtons = screen.getAllByRole("button", { name: "New Chat" });
    fireEvent.click(newChatButtons[0] as HTMLElement);
    expect(await screen.findByText("New Conversation")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Start Chat" }));
    await waitFor(() =>
      expect(screen.getByText("Ask your first question about this project.")).toBeTruthy(),
    );
  });
});
