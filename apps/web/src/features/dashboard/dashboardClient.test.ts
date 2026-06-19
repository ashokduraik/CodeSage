import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@/shared/lib/apiClient", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "@/shared/lib/apiClient";
import { fetchDashboardStats, fetchDashboardSessions } from "./dashboardClient";
import type { NodeApi } from "@codesage/shared-types";

type DashboardStats = NodeApi.components["schemas"]["DashboardStats"];
type ChatSession = NodeApi.components["schemas"]["ChatSession"];

const mockFetch = vi.mocked(apiFetch);

afterEach(() => vi.clearAllMocks());

const STATS: DashboardStats = {
  projectCount: 4,
  indexedProjectCount: 1,
  sessionCount: 3,
  knowledgeCount: 18,
  pendingReviewCount: 2,
};

const SESSIONS: ChatSession[] = [
  {
    id: "s1",
    title: "Auth flow",
    mode: "developer",
    projectId: "p1",
    projectName: "acme/web",
    messageCount: 4,
    lastMessageAt: "2026-06-14T11:48:00.000Z",
  },
];

describe("fetchDashboardStats", () => {
  it("calls GET /dashboard/stats and returns stats", async () => {
    mockFetch.mockResolvedValue(STATS);
    const result = await fetchDashboardStats();
    expect(result).toEqual(STATS);
    expect(mockFetch).toHaveBeenCalledWith("/dashboard/stats");
  });
});

describe("fetchDashboardSessions", () => {
  it("calls GET /dashboard/sessions and returns sessions", async () => {
    mockFetch.mockResolvedValue(SESSIONS);
    const result = await fetchDashboardSessions();
    expect(result).toEqual(SESSIONS);
    expect(mockFetch).toHaveBeenCalledWith("/dashboard/sessions");
  });
});
