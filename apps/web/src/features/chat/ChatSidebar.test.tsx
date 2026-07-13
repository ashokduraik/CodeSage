import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { renderWithRouter } from "@/test/utils";
import type { ChatSession } from "./chatTypes";
import { ChatSidebar } from "./ChatSidebar";

afterEach(cleanup);

const SESSIONS: ChatSession[] = [
  {
    id: "s1",
    title: "Auth flow",
    mode: "developer",
    projectId: "p1",
    projectName: "acme/web",
    messageCount: 4,
    lastMessageAt: new Date().toISOString(),
  },
  {
    id: "s2",
    title: "General help",
    mode: "end_user",
    projectId: null,
    projectName: null,
    messageCount: 0,
    lastMessageAt: null,
  },
];

describe("ChatSidebar", () => {
  it("shows an empty message when there are no sessions", () => {
    renderWithRouter(
      <ChatSidebar
        sessions={[]}
        onNewChat={() => undefined}
        onDeleteSession={() => undefined}
        search=""
        onSearchChange={() => undefined}
      />,
      { route: "/chat" },
    );
    expect(screen.getByText("No conversations yet")).toBeTruthy();
  });

  it("renders sessions with mode labels, project fallback and timestamps", () => {
    renderWithRouter(
      <ChatSidebar
        sessions={SESSIONS}
        onNewChat={() => undefined}
        onDeleteSession={() => undefined}
        search=""
        onSearchChange={() => undefined}
      />,
      { route: "/chat" },
    );
    expect(screen.getByText("Auth flow")).toBeTruthy();
    expect(screen.getByText(/Developer · acme\/web/)).toBeTruthy();
    expect(screen.getByText(/End User · General/)).toBeTruthy();
  });

  it("fires callbacks for new chat and search", () => {
    const onNewChat = vi.fn();
    const onSearchChange = vi.fn();
    renderWithRouter(
      <ChatSidebar
        sessions={SESSIONS}
        onNewChat={onNewChat}
        onDeleteSession={() => undefined}
        search=""
        onSearchChange={onSearchChange}
      />,
      { route: "/chat" },
    );
    fireEvent.click(screen.getByRole("button", { name: "New Chat" }));
    expect(onNewChat).toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Search chats\u2026"), { target: { value: "auth" } });
    expect(onSearchChange).toHaveBeenCalledWith("auth");
  });

  it("calls delete handler without navigating when delete is clicked", () => {
    const onDeleteSession = vi.fn();
    renderWithRouter(
      <ChatSidebar
        sessions={SESSIONS}
        onNewChat={() => undefined}
        onDeleteSession={onDeleteSession}
        search=""
        onSearchChange={() => undefined}
      />,
      { route: "/chat" },
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete conversation Auth flow" }));
    expect(onDeleteSession).toHaveBeenCalledWith(SESSIONS[0]);
  });
});
