import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@/i18n";
import { Chat } from "./Chat";

const SESSION_ID = "s1";
const SESSION = {
  id: SESSION_ID,
  title: "Auth flow questions",
  mode: "developer" as const,
  projectId: "p1",
  projectName: "acme/storefront",
  messageCount: 2,
  lastMessageAt: "2026-01-01T00:00:01.000Z",
};

const MESSAGES = [
  {
    id: "m1",
    conversationId: SESSION_ID,
    role: "user" as const,
    content: "Where is the login handler defined?",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "m2",
    conversationId: SESSION_ID,
    role: "assistant" as const,
    content:
      "The login handler lives in the auth module and validates credentials before issuing a session token.",
    citations: [{ kind: "code" as const, repoId: "r1", filePath: "src/auth/login.ts" }],
    metrics: {
      contextChunks: 2,
      contextTokens: 1800,
      maxContextTokens: 32768,
      totalTokens: 920,
      tokensPerSecond: 22.5,
    },
    createdAt: "2026-01-01T00:00:01.000Z",
  },
];

const EMPTY_SESSION = {
  id: "s-empty",
  title: "New Chat",
  mode: "developer" as const,
  projectId: "p1",
  projectName: "acme/storefront",
  messageCount: 0,
  lastMessageAt: null,
};

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
  listConversations: vi.fn(),
  getConversation: vi.fn(),
  listConversationMessages: vi.fn(),
  createConversation: vi.fn(),
  deleteConversation: vi.fn(),
  streamChatQuery: vi.fn().mockResolvedValue({
    content: "Logout is handled in src/auth/logout.ts",
    sources: ["src/auth/logout.ts"],
    needsReview: false,
    confidence: 0.9,
    title: "Logout handler",
    aborted: false,
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

beforeEach(async () => {
  const client = await import("./chatClient");
  vi.mocked(client.listConversations).mockResolvedValue([SESSION]);
  vi.mocked(client.getConversation).mockImplementation(async (id: string) => {
    if (id === EMPTY_SESSION.id) {
      return EMPTY_SESSION;
    }
    return SESSION;
  });
  vi.mocked(client.listConversationMessages).mockImplementation(async (id: string) => {
    if (id === EMPTY_SESSION.id) {
      return [];
    }
    return MESSAGES;
  });
  vi.mocked(client.createConversation).mockResolvedValue(EMPTY_SESSION);
  vi.mocked(client.deleteConversation).mockResolvedValue(undefined);
});

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
    const client = await import("./chatClient");
    vi.mocked(client.listConversations).mockResolvedValue([]);
    renderChat("/chat");
    expect(await screen.findByText("Ask CodeSage")).toBeTruthy();
    expect(screen.getByText("Select or start a conversation")).toBeTruthy();
  });

  it("renders the selected conversation with its messages", async () => {
    renderChat(`/chat/${SESSION_ID}`);
    expect(await screen.findByText(/validates credentials/)).toBeTruthy();
    expect(screen.getByText("Context")).toBeTruthy();
    expect(screen.getByLabelText(/Context window/)).toBeTruthy();
  });

  it("prompts for a first question on an empty conversation", async () => {
    renderChat(`/chat/${EMPTY_SESSION.id}`);
    expect(await screen.findByText("Ask your first question about this project.")).toBeTruthy();
  });

  it("toggles the conversation sidebar", async () => {
    renderChat(`/chat/${SESSION_ID}`);
    await screen.findByText(/validates credentials/);
    fireEvent.click(screen.getByRole("button", { name: "Toggle conversation list" }));
    expect(screen.getByRole("button", { name: "Toggle conversation list" })).toBeTruthy();
  });

  it("sends a message and calls the streaming client", async () => {
    const client = await import("./chatClient");
    renderChat(`/chat/${SESSION_ID}`);
    await screen.findByText(/validates credentials/);
    fireEvent.change(screen.getByLabelText("Ask about your codebase\u2026"), {
      target: { value: "What about logout?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => {
      expect(client.streamChatQuery).toHaveBeenCalledWith(
        { conversationId: SESSION_ID, question: "What about logout?" },
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
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

  it("opens delete confirmation from the sidebar and deletes the active conversation", async () => {
    const client = await import("./chatClient");
    renderChat(`/chat/${SESSION_ID}`);
    await screen.findByText(/validates credentials/);
    fireEvent.click(screen.getByRole("button", { name: "Delete conversation Auth flow questions" }));
    expect(await screen.findByText("Delete conversation?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => {
      expect(client.deleteConversation).toHaveBeenCalledWith(SESSION_ID);
    });
    expect(await screen.findByText("Select or start a conversation")).toBeTruthy();
  });

  it("shows an error when delete fails", async () => {
    const client = await import("./chatClient");
    vi.mocked(client.deleteConversation).mockRejectedValueOnce(new Error("fail"));
    renderChat(`/chat/${SESSION_ID}`);
    await screen.findByText(/validates credentials/);
    fireEvent.click(screen.getByRole("button", { name: "Delete conversation Auth flow questions" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Could not delete conversation. Please try again.")).toBeTruthy();
  });

  it("shows a meaningful error when the chat query fails", async () => {
    const client = await import("./chatClient");
    const { ApiClientError } = await import("@/shared/lib/apiClient");
    vi.mocked(client.streamChatQuery).mockRejectedValueOnce(
      new ApiClientError(502, "ENGINE_UNAVAILABLE", "fetch failed"),
    );
    renderChat(`/chat/${SESSION_ID}`);
    await screen.findByText(/validates credentials/);
    fireEvent.change(screen.getByLabelText("Ask about your codebase\u2026"), {
      target: { value: "hi" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(await screen.findByText(/answer engine is unavailable/i)).toBeTruthy();
  });
});
