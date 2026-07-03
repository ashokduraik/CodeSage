import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act, waitFor, cleanup } from "@testing-library/react";
import { useDeleteProject } from "./useDeleteProject";
import { HookWrapper } from "@/test/utils";

vi.mock("./projectsClient", () => ({
  deleteProjectRequest: vi.fn(),
}));

import { deleteProjectRequest } from "./projectsClient";

const mockDelete = vi.mocked(deleteProjectRequest);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useDeleteProject", () => {
  it("calls deleteProjectRequest with the project id", async () => {
    mockDelete.mockResolvedValue(undefined);
    const { result } = renderHook(() => useDeleteProject(), { wrapper: HookWrapper });
    await act(async () => {
      await result.current.mutateAsync("p1");
    });
    expect(mockDelete).toHaveBeenCalledWith("p1");
  });

  it("exposes an error state when soft delete fails", async () => {
    mockDelete.mockRejectedValue(new Error("Delete failed"));
    const { result } = renderHook(() => useDeleteProject(), { wrapper: HookWrapper });
    await act(async () => {
      result.current.mutate("missing");
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("Delete failed");
  });
});
