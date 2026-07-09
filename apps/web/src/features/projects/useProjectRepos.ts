import { useQuery } from "@tanstack/react-query";
import { fetchRepos, reposQueryKey } from "./projectsClient";
import type { NodeApi } from "@codesage/shared-types";

type Repo = NodeApi.components["schemas"]["Repo"];
type ProjectStatus = NodeApi.components["schemas"]["ProjectStatus"];

/** Poll interval while repos are indexing or the parent project is mid-index. */
export const REPOS_POLL_MS = 5000;

/** Options for {@link useProjectRepos}. */
export interface UseProjectReposOptions {
  projectId: string;
  /** Parent project lifecycle; enables polling when `indexing`. */
  projectStatus?: ProjectStatus;
}

/**
 * Returns true when the repo list should poll for live status updates.
 *
 * @param repos - Latest fetched repo rows.
 * @param projectStatus - Optional parent project lifecycle status.
 * @returns Whether polling should stay active.
 */
export function shouldPollProjectRepos(
  repos: Repo[] | undefined,
  projectStatus?: ProjectStatus,
): boolean {
  if (projectStatus === "indexing" || projectStatus === "connecting" || projectStatus === "stale") {
    return true;
  }
  return repos?.some((repo) => repo.connectionStatus === "connecting") ?? false;
}

/**
 * Fetches repos attached to a project.
 *
 * Polls every {@link REPOS_POLL_MS} while any repo is connecting or the parent
 * project is in an indexing lifecycle state.
 *
 * @param options - Project id and optional parent status for polling.
 * @returns React Query result with repo list.
 */
export function useProjectRepos(options: UseProjectReposOptions | string) {
  const projectId = typeof options === "string" ? options : options.projectId;
  const projectStatus = typeof options === "string" ? undefined : options.projectStatus;

  return useQuery<Repo[]>({
    queryKey: reposQueryKey(projectId),
    queryFn: () => fetchRepos(projectId),
    enabled: Boolean(projectId),
    refetchInterval: (query) =>
      shouldPollProjectRepos(query.state.data, projectStatus) ? REPOS_POLL_MS : false,
  });
}
