import { useMutation, useQueryClient } from "@tanstack/react-query";
import { attachRepoRequest } from "./projectsClient";
import { projectsQueryKey } from "./useProjects";
import type { NodeApi } from "@codesage/shared-types";

type CreateRepoRequest = NodeApi.components["schemas"]["CreateRepoRequest"];
type AttachRepoResponse = NodeApi.components["schemas"]["AttachRepoResponse"];

/** Variables accepted by the attach-repo mutation. */
export interface AttachRepoVars {
  projectId: string;
  body: CreateRepoRequest;
}

/**
 * Mutation hook that attaches a repository to a project and invalidates the projects cache.
 * @returns React Query mutation result typed against {@link AttachRepoVars} and {@link AttachRepoResponse}.
 */
export function useAttachRepo() {
  const queryClient = useQueryClient();

  return useMutation<AttachRepoResponse, Error, AttachRepoVars>({
    mutationFn: ({ projectId, body }) => attachRepoRequest(projectId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectsQueryKey });
    },
  });
}
