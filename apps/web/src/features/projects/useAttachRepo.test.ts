import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useAttachRepo } from "./useAttachRepo";
import { HookWrapper } from "@/test/utils";

vi.mock("./projectsClient", () => ({
  attachRepoRequest: vi.fn(),
  reposQueryKey: (id: string) => ["projects", id, "repos"],
}));

import { attachRepoRequest } from "./projectsClient";

const mockAttach = vi.mocked(attachRepoRequest);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useAttachRepo", () => {
  it("calls attachRepoRequest with projectId and body", async () => {
    mockAttach.mockResolvedValue({
      repo: {
        id: "r1",
        projectId: "p1",
        repoUrl: "https://github.com/o/r",
        provider: "github",
        branch: "main",
        fullName: "o/r",
        isPrivate: false,
        connectionStatus: "connecting",
        webhookEnabled: false,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      jobId: "j1",
    });
    const { result } = renderHook(() => useAttachRepo(), { wrapper: HookWrapper });
    await act(async () => {
      await result.current.mutateAsync({
        projectId: "p1",
        body: { repoUrl: "https://github.com/o/r", branch: "main" },
      });
    });
    expect(mockAttach).toHaveBeenCalledWith("p1", {
      repoUrl: "https://github.com/o/r",
      branch: "main",
    });
  });
});
