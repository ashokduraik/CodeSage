import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { renderWithRouter } from "@/test/utils";
import type { DashboardData } from "./useDashboardData";
import { Dashboard } from "./Dashboard";

vi.mock("./useDashboardData", () => ({ useDashboardData: vi.fn() }));
import { useDashboardData } from "./useDashboardData";

const mockUse = vi.mocked(useDashboardData);

/** Builds a minimal hook return value for a given state. */
function hookState(over: Partial<ReturnType<typeof useDashboardData>>) {
  return { isPending: false, isError: false, data: undefined, ...over } as ReturnType<
    typeof useDashboardData
  >;
}

const POPULATED: DashboardData = {
  projects: [
    { id: "p1", name: "acme/web", status: "indexed" as const, repoCount: 3, createdAt: "2026-06-14T12:00:00.000Z" },
    { id: "p2", name: "acme/api", status: "indexing" as const, repoCount: 1, createdAt: "2026-06-14T12:00:00.000Z" },
  ],
  sessions: [
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
      title: "Getting started",
      mode: "end_user",
      projectId: null,
      projectName: null,
      messageCount: 0,
      lastMessageAt: null,
    },
  ],
  stats: {
    projectCount: 2,
    indexedProjectCount: 1,
    sessionCount: 2,
    knowledgeCount: 5,
    pendingReviewCount: 1,
  },
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Dashboard", () => {
  it("shows a spinner while loading", () => {
    mockUse.mockReturnValue(hookState({ isPending: true }));
    renderWithRouter(<Dashboard />);
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("shows an error message when the query fails", () => {
    mockUse.mockReturnValue(hookState({ isError: true }));
    renderWithRouter(<Dashboard />);
    expect(screen.getByText("Could not load the dashboard. Please try again.")).toBeTruthy();
  });

  it("renders projects and conversations when data is available", () => {
    mockUse.mockReturnValue(hookState({ data: POPULATED }));
    renderWithRouter(<Dashboard />);
    expect(screen.getByText("Dashboard")).toBeTruthy();
    expect(screen.getByText("acme/web")).toBeTruthy();
    expect(screen.getByText("acme/api")).toBeTruthy();
    expect(screen.getByText("Auth flow")).toBeTruthy();
    expect(screen.getByText("Getting started")).toBeTruthy();
    expect(screen.getByRole("link", { name: /View all/ })).toBeTruthy();
  });

  it("shows empty states and hides conversations when there is no data", () => {
    mockUse.mockReturnValue(
      hookState({
        data: {
          projects: [],
          sessions: [],
          stats: {
            projectCount: 0,
            indexedProjectCount: 0,
            sessionCount: 0,
            knowledgeCount: 0,
            pendingReviewCount: 0,
          },
        },
      }),
    );
    renderWithRouter(<Dashboard />);
    expect(screen.getByText("No projects connected yet.")).toBeTruthy();
    expect(screen.queryByText("Recent Conversations")).toBeNull();
  });
});
