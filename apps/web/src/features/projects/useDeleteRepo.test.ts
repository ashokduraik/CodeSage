import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act, waitFor, cleanup } from "@testing-library/react";
import { useDeleteRepo } from "./useDeleteRepo";
import { HookWrapper } from "@/test/utils";

vi.mock("./projectsClient", () => ({
  deleteRepoRequest: vi.fn(),
  reposQueryKey: (id: string) => ["projects", id, "repos"],
}));

import { deleteRepoRequest } from "./projectsClient";

const mockDelete = vi.mocked(deleteRepoRequest);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useDeleteRepo", () => {
  it("calls deleteRepoRequest with project and repo ids", async () => {
    mockDelete.mockResolvedValue(undefined);
    const { result } = renderHook(() => useDeleteRepo(), { wrapper: HookWrapper });
    await act(async () => {
      await result.current.mutateAsync({ projectId: "p1", repoId: "r1" });
    });
    expect(mockDelete).toHaveBeenCalledWith("p1", "r1");
  });

  it("exposes an error state when soft detach fails", async () => {
    mockDelete.mockRejectedValue(new Error("Detach failed"));
    const { result } = renderHook(() => useDeleteRepo(), { wrapper: HookWrapper });
    await act(async () => {
      result.current.mutate({ projectId: "p1", repoId: "r1" });
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("Detach failed");
  });
});
