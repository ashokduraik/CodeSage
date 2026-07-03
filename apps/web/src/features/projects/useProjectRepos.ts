import { useQuery } from "@tanstack/react-query";
import { fetchRepos, reposQueryKey } from "./projectsClient";
import type { NodeApi } from "@codesage/shared-types";

type Repo = NodeApi.components["schemas"]["Repo"];

/**
 * Fetches repos attached to a project.
 * @param projectId - Parent project UUID; query disabled when empty.
 * @returns React Query result with repo list.
 */
export function useProjectRepos(projectId: string) {
  return useQuery<Repo[]>({
    queryKey: reposQueryKey(projectId),
    queryFn: () => fetchRepos(projectId),
    enabled: Boolean(projectId),
  });
}
