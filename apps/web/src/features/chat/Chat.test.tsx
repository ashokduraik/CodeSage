import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@/i18n";
import {
  appendMessagePair,
  createSession,
  resetChatStore,
} from "./chatStore";
import { Chat } from "./Chat";

vi.mock("@/features/projects/projectsClient", () => ({
  fetchProjects: vi.fn().mockResolvedValue([
    {
      id: "p1",
      name: "acme/storefront",
      status: "indexed",
      repoCount: 3,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ]),
}));

vi.mock("./chatClient", () => ({
  streamChatQuery: vi.fn().mockResolvedValue({
    content: "Logout is handled in src/auth/logout.ts",
    sources: ["src/auth/logout.ts"],
    needsReview: false,
    confidence: 0.9,
    title: "Logout handler",
  }),
  parseChatSseLine: vi.fn(),
  formatCitationSource: vi.fn((c: { filePath: string }) => c.filePath),
}));

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    value: vi.fn(),
    writable: true,
  });
});

beforeEach(() => resetChatStore());
afterEach(cleanup);

async function seedSessionWithMessages(): Promise<string> {
  const session = await createSession({
    mode: "developer",
    projectId: "p1",
    projectName: "acme/storefront",
  });
  await appendMessagePair(
    session.id,
    { id: "m1", sessionId: session.id, role: "user", content: "Where is the login handler defined?" },
    {
      id: "m2",
      sessionId: session.id,
      role: "assistant",
      content: "The login handler lives in the auth module and validates credentials before issuing a session token.",
      confidence: 0.9,
      sources: ["src/auth/login.ts", "src/auth/session.ts"],
      metrics: {
        contextChunks: 2,
        contextTokens: 1800,
        maxContextTokens: 32768,
        totalTokens: 920,
        tokensPerSecond: 22.5,
      },
    },
    "Auth flow questions",
  );
  return session.id;
}

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
    expect(screen.queryByText("Auth flow questions")).toBeNull();
  });

  it("renders the selected conversation with its messages", async () => {
    const sessionId = await seedSessionWithMessages();
    renderChat(`/chat/${sessionId}`);
    expect(await screen.findByText(/validates credentials/)).toBeTruthy();
    expect(screen.getByText("Context")).toBeTruthy();
    expect(screen.getByLabelText(/Context window/)).toBeTruthy();
  });

  it("prompts for a first question on an empty conversation", async () => {
    const session = await createSession({
      mode: "developer",
      projectId: "p1",
      projectName: "acme/storefront",
    });
    renderChat(`/chat/${session.id}`);
    expect(await screen.findByText("Ask your first question about this project.")).toBeTruthy();
  });

  it("toggles the conversation sidebar", async () => {
    const sessionId = await seedSessionWithMessages();
    renderChat(`/chat/${sessionId}`);
    await screen.findByText(/validates credentials/);
    fireEvent.click(screen.getByRole("button", { name: "Toggle conversation list" }));
    expect(screen.getByRole("button", { name: "Toggle conversation list" })).toBeTruthy();
  });

  it("sends a message and appends it to the thread", async () => {
    const sessionId = await seedSessionWithMessages();
    renderChat(`/chat/${sessionId}`);
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
    expect(screen.queryByLabelText("Title")).toBeNull();
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
    fireEvent.click(await screen.findByRole("button", { name: "Start a Conversation" }));
    await screen.findByRole("option", { name: "acme/storefront" });
    fireEvent.change(screen.getByLabelText("Project"), { target: { value: "p1" } });
    fireEvent.click(screen.getByRole("button", { name: "Start Chat" }));
    await waitFor(() => {
      expect(screen.queryByText("Select or start a conversation")).toBeNull();
    });
    expect(await screen.findByText("Ask your first question about this project.")).toBeTruthy();
  });
});
