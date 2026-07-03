import { describe, it, expect, beforeEach } from "vitest";
import {
  appendMessagePair,
  createSession,
  getSession,
  listMessages,
  listSessions,
  resetChatStore,
  updateSessionTitle,
} from "./chatStore";
import type { ChatMessage } from "./chatTypes";

beforeEach(() => resetChatStore());

describe("chatStore", () => {
  it("starts empty with no seeded sessions", async () => {
    expect(await listSessions()).toEqual([]);
  });

  it("creates a project-scoped session with a placeholder title", async () => {
    const session = await createSession({
      mode: "developer",
      projectId: "p1",
      projectName: "acme/storefront",
    });
    expect(session.title).toBe("New Chat");
    expect(session.projectName).toBe("acme/storefront");
    expect((await listSessions()).map((item) => item.id)).toContain(session.id);
  });

  it("updates the session title", async () => {
    const session = await createSession({
      mode: "developer",
      projectId: "p1",
      projectName: "acme/storefront",
    });
    const updated = await updateSessionTitle(session.id, "Auth flow");
    expect(updated.title).toBe("Auth flow");
    expect((await getSession(session.id))?.title).toBe("Auth flow");
  });

  it("appends messages and bumps session metadata", async () => {
    const session = await createSession({
      mode: "developer",
      projectId: "p1",
      projectName: "acme/storefront",
    });
    const userMessage: ChatMessage = {
      id: "m1",
      sessionId: session.id,
      role: "user",
      content: "Where is auth?",
    };
    const assistantMessage: ChatMessage = {
      id: "m2",
      sessionId: session.id,
      role: "assistant",
      content: "In src/auth.ts",
      confidence: 0.9,
      sources: ["src/auth.ts"],
    };

    const result = await appendMessagePair(
      session.id,
      userMessage,
      assistantMessage,
      "Auth handler location",
    );
    expect(result.session.messageCount).toBe(2);
    expect(result.session.title).toBe("Auth handler location");
    expect(await listMessages(session.id)).toHaveLength(2);
  });

  it("throws for unknown sessions when updating title", async () => {
    await expect(updateSessionTitle("missing", "Title")).rejects.toThrow(/unknown session/);
  });

  it("throws for unknown sessions when appending messages", async () => {
    await expect(
      appendMessagePair(
        "missing",
        { id: "m1", sessionId: "missing", role: "user", content: "hi" },
        { id: "m2", sessionId: "missing", role: "assistant", content: "bye" },
      ),
    ).rejects.toThrow(/unknown session/);
  });

  it("persists state to localStorage when available", async () => {
    const session = await createSession({
      mode: "developer",
      projectId: "p1",
      projectName: "acme/storefront",
    });
    const reloaded = await getSession(session.id);
    expect(reloaded?.id).toBe(session.id);
  });
});
