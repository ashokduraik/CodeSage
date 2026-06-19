import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth";
import { fetchProjects } from "./projectsClient";
import type { NodeApi } from "@codesage/shared-types";

type Project = NodeApi.components["schemas"]["Project"];

/** React Query cache key for the projects list. */
export const projectsQueryKey = ["projects"] as const;

/**
 * Fetches and caches the list of projects for the authenticated user.
 * Automatically disabled when there is no JWT token.
 * @returns React Query result with `data` typed as {@link Project}[].
 */
export function useProjects() {
  const { user } = useAuth();

  return useQuery<Project[]>({
    queryKey: projectsQueryKey,
    queryFn: () => fetchProjects(),
    enabled: Boolean(user),
  });
}
