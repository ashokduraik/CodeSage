import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useRepoIndexingEvents } from "./useRepoIndexingEvents";

vi.mock("./projectsClient", () => ({
  fetchRepoIndexingEvents: vi.fn(),
  INDEXING_LOGS_PAGE_SIZE: 50,
  repoIndexingEventsQueryKey: (projectId: string, repoId: string) =>
    ["projects", projectId, "repos", repoId, "indexing-events"],
}));

import { fetchRepoIndexingEvents } from "./projectsClient";

const mockFetch = vi.mocked(fetchRepoIndexingEvents);

function wrapper(client: QueryClient) {
  return function QueryWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

afterEach(() => vi.clearAllMocks());

describe("useRepoIndexingEvents", () => {
  it("merges multiple pages from infinite query", async () => {
    mockFetch
      .mockResolvedValueOnce({
        items: [
          {
            id: "e1",
            runId: "run-1",
            step: "embed",
            phase: "finished",
            startedAt: "2026-07-04T14:36:00.000Z",
            message: "Newest",
          },
        ],
        limit: 50,
        hasMore: true,
        nextCursor: "cursor-1",
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: "e2",
            runId: "run-1",
            step: "parse",
            phase: "finished",
            startedAt: "2026-07-04T14:35:00.000Z",
            message: "Older",
          },
        ],
        limit: 50,
        hasMore: false,
        nextCursor: null,
      });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(
      () => useRepoIndexingEvents({ projectId: "p1", repoId: "r1" }),
      { wrapper: wrapper(client) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.pages).toHaveLength(1);

    await result.current.fetchNextPage();

    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    const merged = result.current.data?.pages.flatMap((p) => p.items) ?? [];
    expect(merged).toHaveLength(2);
    expect(merged[0]?.message).toBe("Newest");
    expect(merged[1]?.message).toBe("Older");
  });

  it("enables polling when pollWhileConnecting is true", async () => {
    mockFetch.mockResolvedValue({
      items: [],
      limit: 50,
      hasMore: false,
      nextCursor: null,
    });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(
      () =>
        useRepoIndexingEvents({
          projectId: "p1",
          repoId: "r1",
          pollWhileConnecting: true,
        }),
      { wrapper: wrapper(client) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalled();
  });
});
