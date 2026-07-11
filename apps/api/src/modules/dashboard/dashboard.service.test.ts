import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("./dashboard.repository", () => ({
  getProjectCounts: vi.fn(),
}));

vi.mock("../chat/chat.repository", () => ({
  countConversationsByUser: vi.fn(),
  findRecentConversationsByUser: vi.fn(),
}));

const { getDashboardStats, listDashboardSessions } = await import("./dashboard.service");
import { getProjectCounts } from "./dashboard.repository";
import {
  countConversationsByUser,
  findRecentConversationsByUser,
} from "../chat/chat.repository";
import { MOCK_STATS, MOCK_SESSIONS } from "../../platform/mock-data";
import type { Sql } from "../../platform/db";

const mockCounts = vi.mocked(getProjectCounts);
const mockSessionCount = vi.mocked(countConversationsByUser);
const mockRecentSessions = vi.mocked(findRecentConversationsByUser);
const DB = {} as Sql;
const USER_ID = "u1";

afterEach(() => vi.clearAllMocks());

describe("getDashboardStats", () => {
  it("returns static mock stats when mockMode is true", async () => {
    const stats = await getDashboardStats(DB, USER_ID, true);
    expect(stats).toEqual({ ...MOCK_STATS });
    expect(mockCounts).not.toHaveBeenCalled();
  });

  it("queries the database when mockMode is false", async () => {
    mockCounts.mockResolvedValue({ projectCount: 7, indexedProjectCount: 4 });
    mockSessionCount.mockResolvedValue(3);
    const stats = await getDashboardStats(DB, USER_ID, false);
    expect(stats.projectCount).toBe(7);
    expect(stats.indexedProjectCount).toBe(4);
    expect(stats.sessionCount).toBe(3);
    expect(stats.knowledgeCount).toBe(0);
    expect(stats.pendingReviewCount).toBe(0);
    expect(mockCounts).toHaveBeenCalledWith(DB);
    expect(mockSessionCount).toHaveBeenCalledWith(DB, USER_ID);
  });
});

describe("listDashboardSessions", () => {
  it("returns static mock sessions when mockMode is true", async () => {
    const sessions = await listDashboardSessions(DB, USER_ID, true);
    expect(sessions).toHaveLength(MOCK_SESSIONS.length);
    expect(sessions[0]?.id).toBe(MOCK_SESSIONS[0]?.id);
  });

  it("returns recent conversations from the database in normal mode", async () => {
    mockRecentSessions.mockResolvedValue([
      {
        id: "c1",
        project_id: "p1",
        user_id: USER_ID,
        audience: "developer",
        title: "Auth",
        project_name: "demo",
        message_count: 2,
        last_message_at: new Date("2026-01-01T00:00:00.000Z"),
        created_at: new Date("2026-01-01T00:00:00.000Z"),
        updated_at: new Date("2026-01-01T00:00:00.000Z"),
      },
    ]);
    const sessions = await listDashboardSessions(DB, USER_ID, false);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.title).toBe("Auth");
  });
});
