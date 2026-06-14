import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth";
import { createProjectRequest } from "./projectsClient";
import { projectsQueryKey } from "./useProjects";
import type { NodeApi } from "@codesage/shared-types";

type CreateProjectRequest = NodeApi.components["schemas"]["CreateProjectRequest"];
type Project = NodeApi.components["schemas"]["Project"];

/**
 * Mutation hook that creates a new project and invalidates the projects list cache.
 * @returns React Query mutation result typed against {@link CreateProjectRequest} and {@link Project}.
 */
export function useCreateProject() {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  return useMutation<Project, Error, CreateProjectRequest>({
    mutationFn: (body) => createProjectRequest(token!, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectsQueryKey });
    },
  });
}
