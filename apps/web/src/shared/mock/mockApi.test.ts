import { describe, it, expect, beforeEach } from "vitest";
import {
  CONFIDENCE_THRESHOLD,
  createSession,
  generateMockAnswer,
  getDashboardStats,
  getSession,
  listMessages,
  listProjects,
  listSessions,
  resetMockStore,
  sendMessage,
} from "./mockApi";
import type { ChatSession } from "./types";

beforeEach(() => resetMockStore());

describe("mockApi reads", () => {
  it("lists seeded projects as copies", async () => {
    const projects = await listProjects();
    expect(projects.length).toBeGreaterThan(0);
    expect(projects[0]).toHaveProperty("status");
  });

  it("returns dashboard stats derived from the store", async () => {
    const stats = await getDashboardStats();
    expect(stats.projectCount).toBe((await listProjects()).length);
    expect(stats.sessionCount).toBe((await listSessions()).length);
  });

  it("sorts sessions by most recent activity, nulls last", async () => {
    const sessions = await listSessions();
    expect(sessions[0]?.id).toBe("s1");
    expect(sessions[sessions.length - 1]?.lastMessageAt).toBeNull();
  });

  it("returns a session by id and null for unknown ids", async () => {
    expect((await getSession("s1"))?.title).toBe("Auth flow questions");
    expect(await getSession("nope")).toBeNull();
  });

  it("returns messages for a session and an empty list otherwise", async () => {
    expect(await listMessages("s1")).toHaveLength(2);
    expect(await listMessages("s3")).toEqual([]);
  });
});

describe("createSession", () => {
  it("creates a project-scoped session resolving the project name", async () => {
    const session = await createSession({ title: "New", mode: "developer", projectId: "p1" });
    expect(session.projectName).toBe("acme/storefront");
    const ids = (await listSessions()).map((s) => s.id);
    expect(ids).toContain(session.id);
  });

  it("creates a general session when no project is given", async () => {
    const session = await createSession({ title: "General", mode: "end_user", projectId: null });
    expect(session.projectId).toBeNull();
    expect(session.projectName).toBeNull();
  });

  it("ignores an unknown project id", async () => {
    const session = await createSession({ title: "X", mode: "developer", projectId: "ghost" });
    expect(session.projectName).toBeNull();
  });
});

describe("generateMockAnswer", () => {
  const dev: ChatSession = {
    id: "s",
    title: "t",
    mode: "developer",
    projectId: "p1",
    projectName: "acme/storefront",
    messageCount: 0,
    lastMessageAt: null,
  };

  it("returns high confidence with citations when a project is set", () => {
    const result = generateMockAnswer("how does auth work?", dev);
    expect(result.confidence).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLD);
    expect(result.sources).toHaveLength(1);
    expect(result.needsReview).toBe(false);
  });

  it("returns low confidence and review flag without a project", () => {
    const result = generateMockAnswer("anything", { ...dev, projectId: null, projectName: null });
    expect(result.confidence).toBeLessThan(CONFIDENCE_THRESHOLD);
    expect(result.sources).toEqual([]);
    expect(result.needsReview).toBe(true);
  });

  it("phrases end-user answers differently from developer answers", () => {
    const end = generateMockAnswer("export invoices", { ...dev, mode: "end_user" });
    expect(end.answer).toContain("acme/storefront");
  });

  it("falls back to a generic app name for end-user answers without a project", () => {
    const end = generateMockAnswer("how do I log in?", {
      ...dev,
      mode: "end_user",
      projectId: null,
      projectName: null,
    });
    expect(end.answer).toContain("the app");
  });
});

describe("sendMessage", () => {
  it("appends a user message and a generated reply and bumps the session", async () => {
    const result = await sendMessage("s1", "What changed?");
    expect(result.userMessage.role).toBe("user");
    expect(result.assistantMessage.role).toBe("assistant");
    expect(result.session.messageCount).toBe(6);
    expect(result.session.lastMessageAt).not.toBeNull();
    expect(await listMessages("s1")).toHaveLength(4);
  });

  it("starts message history for a freshly created session", async () => {
    const session = await createSession({ title: "Fresh", mode: "developer", projectId: "p1" });
    await sendMessage(session.id, "hello");
    expect(await listMessages(session.id)).toHaveLength(2);
  });

  it("seeds history for a session that had no prior messages", async () => {
    expect(await listMessages("s3")).toEqual([]);
    await sendMessage("s3", "first message");
    expect(await listMessages("s3")).toHaveLength(2);
  });

  it("throws for an unknown session", async () => {
    await expect(sendMessage("missing", "hi")).rejects.toThrow(/unknown session/);
  });
});
