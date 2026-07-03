import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteProjectRequest } from "./projectsClient";
import { projectsQueryKey } from "./useProjects";

/**
 * Mutation hook that soft-deletes a project and refreshes the project list.
 */
export function useDeleteProject() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (projectId) => deleteProjectRequest(projectId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectsQueryKey });
    },
  });
}
