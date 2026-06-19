import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { HookWrapper } from "@/test/utils";
import { useDashboardData } from "./useDashboardData";

vi.mock("@/features/auth", () => ({ useAuth: vi.fn() }));
vi.mock("@/features/projects/projectsClient", () => ({ fetchProjects: vi.fn() }));
vi.mock("./dashboardClient", () => ({
  fetchDashboardStats: vi.fn(),
  fetchDashboardSessions: vi.fn(),
}));

import { useAuth } from "@/features/auth";
import { fetchProjects } from "@/features/projects/projectsClient";
import { fetchDashboardStats, fetchDashboardSessions } from "./dashboardClient";
import type { NodeApi } from "@codesage/shared-types";

type Project = NodeApi.components["schemas"]["Project"];
type DashboardStats = NodeApi.components["schemas"]["DashboardStats"];
type ChatSession = NodeApi.components["schemas"]["ChatSession"];

const mockUseAuth = vi.mocked(useAuth);
const mockFetchProjects = vi.mocked(fetchProjects);
const mockFetchStats = vi.mocked(fetchDashboardStats);
const mockFetchSessions = vi.mocked(fetchDashboardSessions);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const PROJECTS: Project[] = [
  { id: "p1", name: "acme/web", status: "indexed", repoCount: 3, createdAt: "2026-06-14T12:00:00.000Z" },
];

const STATS: DashboardStats = {
  projectCount: 1,
  indexedProjectCount: 1,
  sessionCount: 2,
  knowledgeCount: 10,
  pendingReviewCount: 0,
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

function setupAuth(token: string | null = "jwt") {
  mockUseAuth.mockReturnValue({
    user: null,
    token,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
  });
}

describe("useDashboardData", () => {
  it("is disabled when there is no token", () => {
    setupAuth(null);
    const { result } = renderHook(() => useDashboardData(), { wrapper: HookWrapper });
    expect(result.current.isPending).toBe(true);
    expect(mockFetchProjects).not.toHaveBeenCalled();
  });

  it("fetches projects, stats and sessions in parallel when authenticated", async () => {
    setupAuth("jwt");
    mockFetchProjects.mockResolvedValue(PROJECTS);
    mockFetchStats.mockResolvedValue(STATS);
    mockFetchSessions.mockResolvedValue(SESSIONS);

    const { result } = renderHook(() => useDashboardData(), { wrapper: HookWrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.projects).toEqual(PROJECTS);
    expect(result.current.data?.stats).toEqual(STATS);
    expect(result.current.data?.sessions).toEqual(SESSIONS);
    expect(mockFetchProjects).toHaveBeenCalledWith("jwt");
    expect(mockFetchStats).toHaveBeenCalledWith("jwt");
    expect(mockFetchSessions).toHaveBeenCalledWith("jwt");
  });

  it("exposes an error state when a fetch fails", async () => {
    setupAuth("jwt");
    mockFetchProjects.mockRejectedValue(new Error("network error"));
    mockFetchStats.mockResolvedValue(STATS);
    mockFetchSessions.mockResolvedValue(SESSIONS);

    const { result } = renderHook(() => useDashboardData(), { wrapper: HookWrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
