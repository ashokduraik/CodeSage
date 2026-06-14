import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act, waitFor, cleanup } from "@testing-library/react";
import { useAttachRepo } from "./useAttachRepo";
import { HookWrapper } from "@/test/utils";

vi.mock("@/features/auth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("./projectsClient", () => ({
  attachRepoRequest: vi.fn(),
}));

import { useAuth } from "@/features/auth";
import { attachRepoRequest } from "./projectsClient";

const mockUseAuth = vi.mocked(useAuth);
const mockAttach = vi.mocked(attachRepoRequest);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const MOCK_RESPONSE = {
  repo: {
    id: "r1",
    projectId: "p1",
    repoUrl: "https://github.com/o/r",
    provider: "github" as const,
    branch: "main",
    role: "backend" as const,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  jobId: "j1",
};

describe("useAttachRepo", () => {
  it("calls attachRepoRequest and returns the response", async () => {
    mockUseAuth.mockReturnValue({
      user: null, token: "jwt", isLoading: false,
      login: vi.fn(), logout: vi.fn(),
    });
    mockAttach.mockResolvedValue(MOCK_RESPONSE);
    const { result } = renderHook(() => useAttachRepo(), { wrapper: HookWrapper });
    await act(async () => {
      result.current.mutate({
        projectId: "p1",
        body: { repoUrl: "https://github.com/o/r", provider: "github", branch: "main", role: "backend" },
      });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(MOCK_RESPONSE);
  });

  it("exposes an error state when the mutation fails", async () => {
    mockUseAuth.mockReturnValue({
      user: null, token: "jwt", isLoading: false,
      login: vi.fn(), logout: vi.fn(),
    });
    mockAttach.mockRejectedValue(new Error("server error"));
    const { result } = renderHook(() => useAttachRepo(), { wrapper: HookWrapper });
    await act(async () => {
      result.current.mutate({
        projectId: "p1",
        body: { repoUrl: "https://github.com/o/r", provider: "github", branch: "main", role: "backend" },
      });
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
