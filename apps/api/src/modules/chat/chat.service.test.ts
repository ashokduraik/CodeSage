import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../platform/errors";
import {
  createConversation,
  deleteConversation,
  getConversation,
  listConversationMessages,
  listConversations,
  buildHistoryFromMessages,
} from "./chat.service";
import type { MessageRow } from "./chat.repository";

vi.mock("./chat.repository", () => ({
  findConversationsByUser: vi.fn(),
  insertConversation: vi.fn(),
  findConversationByIdForUser: vi.fn(),
  softDeleteConversation: vi.fn(),
  findConversationScopeForUser: vi.fn(),
  findMessagesByConversation: vi.fn(),
}));

import {
  findConversationByIdForUser,
  findConversationScopeForUser,
  findConversationsByUser,
  findMessagesByConversation,
  insertConversation,
  softDeleteConversation,
} from "./chat.repository";

const DB = {} as never;
const USER_ID = "u1";
const CONVERSATION_ID = "22222222-2222-2222-2222-222222222222";

const conversationRow = {
  id: CONVERSATION_ID,
  project_id: "p1",
  user_id: USER_ID,
  audience: "developer",
  title: "Auth",
  project_name: "demo",
  message_count: 2,
  last_message_at: new Date("2026-01-01T00:00:00.000Z"),
  created_at: new Date("2026-01-01T00:00:00.000Z"),
  updated_at: new Date("2026-01-01T00:00:00.000Z"),
};

describe("chat.service", () => {
  it("listConversations maps repository rows", async () => {
    vi.mocked(findConversationsByUser).mockResolvedValue([conversationRow]);
    const sessions = await listConversations(DB, USER_ID);
    expect(sessions[0]?.title).toBe("Auth");
    expect(sessions[0]?.lastMessageAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("listConversations uses default title when blank", async () => {
    vi.mocked(findConversationsByUser).mockResolvedValue([
      { ...conversationRow, title: "   ", last_message_at: null },
    ]);
    const sessions = await listConversations(DB, USER_ID);
    expect(sessions[0]?.title).toBe("New Chat");
    expect(sessions[0]?.lastMessageAt).toBeNull();
  });

  it("createConversation validates required fields", async () => {
    await expect(
      createConversation(DB, { projectId: "", mode: "developer" }, USER_ID),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("createConversation returns hydrated session", async () => {
    vi.mocked(insertConversation).mockResolvedValue({ id: CONVERSATION_ID } as never);
    vi.mocked(findConversationByIdForUser).mockResolvedValue(conversationRow);
    const session = await createConversation(
      DB,
      { projectId: "p1", mode: "developer" },
      USER_ID,
    );
    expect(session.id).toBe(CONVERSATION_ID);
  });

  it("createConversation fails when hydration returns null", async () => {
    vi.mocked(insertConversation).mockResolvedValue({ id: CONVERSATION_ID } as never);
    vi.mocked(findConversationByIdForUser).mockResolvedValue(undefined);
    await expect(
      createConversation(DB, { projectId: "p1", mode: "developer" }, USER_ID),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("getConversation returns 404 when missing", async () => {
    vi.mocked(findConversationByIdForUser).mockResolvedValue(undefined);
    await expect(getConversation(DB, CONVERSATION_ID, USER_ID)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("getConversation returns mapped session when found", async () => {
    vi.mocked(findConversationByIdForUser).mockResolvedValue(conversationRow);
    const session = await getConversation(DB, CONVERSATION_ID, USER_ID);
    expect(session.id).toBe(CONVERSATION_ID);
  });

  it("deleteConversation succeeds when row is soft-deleted", async () => {
    vi.mocked(softDeleteConversation).mockResolvedValue(true);
    await expect(
      deleteConversation(DB, CONVERSATION_ID, USER_ID, USER_ID),
    ).resolves.toBeUndefined();
  });

  it("deleteConversation returns 404 when not deleted", async () => {
    vi.mocked(softDeleteConversation).mockResolvedValue(false);
    await expect(deleteConversation(DB, CONVERSATION_ID, USER_ID, USER_ID)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("listConversationMessages maps citations and metrics", async () => {
    vi.mocked(findConversationScopeForUser).mockResolvedValue({
      project_id: "p1",
      audience: "developer",
    } as never);
    vi.mocked(findMessagesByConversation).mockResolvedValue([
      {
        id: "m1",
        conversation_id: CONVERSATION_ID,
        role: "assistant",
        content: "answer",
        citations: [{ repoId: "r1", filePath: "a.ts", startLine: 1, endLine: 2 }],
        metrics: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        needs_review: true,
        stopped: false,
        created_at: new Date("2026-01-01T00:00:00.000Z"),
      },
    ] as never);

    const messages = await listConversationMessages(DB, CONVERSATION_ID, USER_ID);
    expect(messages[0]?.citations).toHaveLength(1);
    expect(messages[0]?.metrics?.totalTokens).toBe(15);
    expect(messages[0]?.needsReview).toBe(true);
  });

  it("listConversationMessages returns 404 when conversation scope is missing", async () => {
    vi.mocked(findConversationScopeForUser).mockResolvedValue(undefined);
    await expect(listConversationMessages(DB, CONVERSATION_ID, USER_ID)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("listConversationMessages omits empty citations and metrics", async () => {
    vi.mocked(findConversationScopeForUser).mockResolvedValue({
      project_id: "p1",
      audience: "developer",
    } as never);
    vi.mocked(findMessagesByConversation).mockResolvedValue([
      {
        id: "m2",
        conversation_id: CONVERSATION_ID,
        role: "user",
        content: "question",
        citations: [],
        metrics: null,
        needs_review: false,
        stopped: false,
        created_at: new Date("2026-01-01T00:00:00.000Z"),
      },
    ] as never);

    const messages = await listConversationMessages(DB, CONVERSATION_ID, USER_ID);
    expect(messages[0]?.citations).toBeUndefined();
    expect(messages[0]?.metrics).toBeUndefined();
  });

  it("buildHistoryFromMessages drops empty and whitespace-only turns", () => {
    const rows = [
      {
        id: "1",
        conversation_id: CONVERSATION_ID,
        role: "user",
        content: "first question",
        citations: [],
        metrics: null,
        needs_review: false,
        stopped: false,
        created_at: new Date(),
      },
      {
        id: "2",
        conversation_id: CONVERSATION_ID,
        role: "assistant",
        content: "",
        citations: [{ kind: "code", repoId: "r1", filePath: "a.ts" }],
        metrics: null,
        needs_review: false,
        stopped: true,
        created_at: new Date(),
      },
      {
        id: "3",
        conversation_id: CONVERSATION_ID,
        role: "assistant",
        content: "   ",
        citations: [],
        metrics: null,
        needs_review: false,
        stopped: false,
        created_at: new Date(),
      },
      {
        id: "4",
        conversation_id: CONVERSATION_ID,
        role: "assistant",
        content: "real answer",
        citations: [],
        metrics: null,
        needs_review: false,
        stopped: false,
        created_at: new Date(),
      },
    ] as MessageRow[];

    expect(buildHistoryFromMessages(rows)).toEqual([
      { role: "user", content: "first question" },
      { role: "assistant", content: "real answer" },
    ]);
  });
});
