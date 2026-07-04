import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useSyncRepo } from "./useSyncRepo";

vi.mock("./projectsClient", () => ({
  syncRepoRequest: vi.fn(),
  reposQueryKey: (projectId: string) => ["projects", projectId, "repos"],
  repoIndexingEventsQueryKey: (projectId: string, repoId: string) =>
    ["projects", projectId, "repos", repoId, "indexing-events"],
}));

import { syncRepoRequest } from "./projectsClient";

const mockSync = vi.mocked(syncRepoRequest);

function wrapper(client: QueryClient) {
  return function QueryWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

afterEach(() => vi.clearAllMocks());

describe("useSyncRepo", () => {
  it("invalidates repos and indexing-events queries on success", async () => {
    mockSync.mockResolvedValue({ jobId: "job-1" });
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useSyncRepo(), { wrapper: wrapper(client) });

    await result.current.mutateAsync({ projectId: "p1", repoId: "r1" });

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalled());
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["projects", "p1", "repos"] });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["projects", "p1", "repos", "r1", "indexing-events"],
    });
  });

  it("surfaces 409 conflict from syncRepoRequest", async () => {
    const { ApiClientError } = await import("@/shared/lib/apiClient");
    mockSync.mockRejectedValue(new ApiClientError(409, "CONFLICT", "Indexing already in progress"));
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });

    const { result } = renderHook(() => useSyncRepo(), { wrapper: wrapper(client) });

    await expect(result.current.mutateAsync({ projectId: "p1", repoId: "r1" })).rejects.toMatchObject({
      status: 409,
      code: "CONFLICT",
    });
  });
});
