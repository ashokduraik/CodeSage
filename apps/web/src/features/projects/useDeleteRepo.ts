import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteRepoRequest, reposQueryKey } from "./projectsClient";
import { projectsQueryKey } from "./useProjects";

/** Variables accepted by the delete-repo mutation. */
export interface DeleteRepoVars {
  projectId: string;
  repoId: string;
}

/**
 * Mutation hook that soft-detaches a repository and refreshes caches.
 */
export function useDeleteRepo() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, DeleteRepoVars>({
    mutationFn: ({ projectId, repoId }) => deleteRepoRequest(projectId, repoId),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: reposQueryKey(variables.projectId) });
      void queryClient.invalidateQueries({ queryKey: projectsQueryKey });
    },
  });
}
