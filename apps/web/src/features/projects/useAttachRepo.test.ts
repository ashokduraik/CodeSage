import { describe, it, expect, vi, afterEach } from "vitest";
import { useAttachRepo } from "./useAttachRepo";

vi.mock("./projectsClient", () => ({
  attachRepoRequest: vi.fn(),
  reposQueryKey: (id: string) => ["projects", id, "repos"],
}));

vi.mock("@tanstack/react-query", () => ({
  useMutation: vi.fn((opts) => opts),
  useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
}));

import { attachRepoRequest } from "./projectsClient";

const mockAttach = vi.mocked(attachRepoRequest);

afterEach(() => vi.clearAllMocks());

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
    const hook = useAttachRepo() as { mutationFn: typeof attachRepoRequest };
    await hook.mutationFn({
      projectId: "p1",
      body: { repoUrl: "https://github.com/o/r", branch: "main" },
    });
    expect(mockAttach).toHaveBeenCalledWith("p1", {
      repoUrl: "https://github.com/o/r",
      branch: "main",
    });
  });
});
