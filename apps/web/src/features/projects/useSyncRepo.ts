import { useMutation, useQueryClient } from "@tanstack/react-query";
import { reposQueryKey, syncRepoRequest } from "./projectsClient";
import type { NodeApi } from "@codesage/shared-types";

type SyncRepoResponse = NodeApi.components["schemas"]["SyncRepoResponse"];

/** Variables accepted by the sync-repo mutation. */
export interface SyncRepoVars {
  projectId: string;
  repoId: string;
}

/**
 * Mutation hook that enqueues a manual sync job and refreshes the repo list.
 */
export function useSyncRepo() {
  const queryClient = useQueryClient();

  return useMutation<SyncRepoResponse, Error, SyncRepoVars>({
    mutationFn: ({ projectId, repoId }) => syncRepoRequest(projectId, repoId),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: reposQueryKey(variables.projectId) });
    },
  });
}
