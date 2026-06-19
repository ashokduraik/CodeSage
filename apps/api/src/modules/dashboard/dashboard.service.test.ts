import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("./dashboard.repository", () => ({
  getProjectCounts: vi.fn(),
}));

const { getDashboardStats, listDashboardSessions } = await import("./dashboard.service");
import { getProjectCounts } from "./dashboard.repository";
import { MOCK_STATS, MOCK_SESSIONS } from "../../platform/mock-data";
import type { Sql } from "../../platform/db";

const mockCounts = vi.mocked(getProjectCounts);
const DB = {} as Sql;

afterEach(() => vi.clearAllMocks());

describe("getDashboardStats", () => {
  it("returns static mock stats when mockMode is true", async () => {
    const stats = await getDashboardStats(DB, true);
    expect(stats).toEqual({ ...MOCK_STATS });
    expect(mockCounts).not.toHaveBeenCalled();
  });

  it("queries the database when mockMode is false", async () => {
    mockCounts.mockResolvedValue({ projectCount: 7, indexedProjectCount: 4 });
    const stats = await getDashboardStats(DB, false);
    expect(stats.projectCount).toBe(7);
    expect(stats.indexedProjectCount).toBe(4);
    expect(stats.sessionCount).toBe(0);
    expect(stats.knowledgeCount).toBe(0);
    expect(stats.pendingReviewCount).toBe(0);
    expect(mockCounts).toHaveBeenCalledWith(DB);
  });

  it("returns zeros for unimplemented counters in normal mode", async () => {
    mockCounts.mockResolvedValue({ projectCount: 2, indexedProjectCount: 1 });
    const stats = await getDashboardStats(DB, false);
    expect(stats.sessionCount).toBe(0);
    expect(stats.knowledgeCount).toBe(0);
    expect(stats.pendingReviewCount).toBe(0);
  });
});

describe("listDashboardSessions", () => {
  it("returns static mock sessions when mockMode is true", async () => {
    const sessions = await listDashboardSessions(DB, true);
    expect(sessions).toHaveLength(MOCK_SESSIONS.length);
    expect(sessions[0]?.id).toBe(MOCK_SESSIONS[0]?.id);
  });

  it("returns an empty array in normal mode (sessions not yet implemented)", async () => {
    const sessions = await listDashboardSessions(DB, false);
    expect(sessions).toEqual([]);
  });
});
