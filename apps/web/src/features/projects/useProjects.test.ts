import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { useProjects, projectsQueryKey } from "./useProjects";
import { HookWrapper } from "@/test/utils";

vi.mock("@/features/auth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("./projectsClient", () => ({
  fetchProjects: vi.fn(),
}));

import { useAuth } from "@/features/auth";
import { fetchProjects } from "./projectsClient";

const mockUseAuth = vi.mocked(useAuth);
const mockFetchProjects = vi.mocked(fetchProjects);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useProjects", () => {
  it("is disabled when no token is present", () => {
    mockUseAuth.mockReturnValue({
      user: null, token: null, isLoading: false,
      login: vi.fn(), logout: vi.fn(),
    });
    const { result } = renderHook(() => useProjects(), { wrapper: HookWrapper });
    expect(result.current.isPending).toBe(true);
    expect(mockFetchProjects).not.toHaveBeenCalled();
  });

  it("fetches and returns projects when a token is present", async () => {
    const projects = [{ id: "p1", name: "Acme", status: "active", createdAt: "2026-01-01T00:00:00.000Z" }];
    mockUseAuth.mockReturnValue({
      user: null, token: "jwt", isLoading: false,
      login: vi.fn(), logout: vi.fn(),
    });
    mockFetchProjects.mockResolvedValue(projects);
    const { result } = renderHook(() => useProjects(), { wrapper: HookWrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(projects);
  });

  it("exposes the correct query key", () => {
    expect(projectsQueryKey).toEqual(["projects"]);
  });
});
