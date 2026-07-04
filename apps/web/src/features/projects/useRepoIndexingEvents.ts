import { useInfiniteQuery } from "@tanstack/react-query";
import {
  fetchRepoIndexingEvents,
  INDEXING_LOGS_PAGE_SIZE,
  repoIndexingEventsQueryKey,
} from "./projectsClient";
import type { NodeApi } from "@codesage/shared-types";

type RepoIndexingEventListResponse =
  NodeApi.components["schemas"]["RepoIndexingEventListResponse"];

/** Options for {@link useRepoIndexingEvents}. */
export interface UseRepoIndexingEventsOptions {
  projectId: string;
  repoId: string;
  /** When true, refetch the first page every 5s (live indexing). */
  pollWhileConnecting?: boolean;
  /** When false, the query does not run. */
  enabled?: boolean;
}

const INDEXING_LOGS_POLL_MS = 5000;

/**
 * Infinite query for repo indexing progress events (newest first).
 *
 * @param options - Project/repo ids, polling, and enabled flag.
 * @returns TanStack infinite query result with flattened pages.
 */
export function useRepoIndexingEvents(options: UseRepoIndexingEventsOptions) {
  const {
    projectId,
    repoId,
    pollWhileConnecting = false,
    enabled = true,
  } = options;

  return useInfiniteQuery<RepoIndexingEventListResponse, Error>({
    queryKey: repoIndexingEventsQueryKey(projectId, repoId),
    enabled: enabled && Boolean(projectId && repoId),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      fetchRepoIndexingEvents(projectId, repoId, {
        limit: INDEXING_LOGS_PAGE_SIZE,
        cursor: typeof pageParam === "string" ? pageParam : undefined,
      }),
    getNextPageParam: (lastPage) =>
      lastPage.hasMore && lastPage.nextCursor ? lastPage.nextCursor : undefined,
    refetchInterval: pollWhileConnecting ? INDEXING_LOGS_POLL_MS : false,
  });
}
