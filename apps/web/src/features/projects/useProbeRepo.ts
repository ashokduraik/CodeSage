import { useMutation } from "@tanstack/react-query";
import { probeRepoRequest } from "./projectsClient";
import type { NodeApi } from "@codesage/shared-types";

type ProbeRepoRequest = NodeApi.components["schemas"]["ProbeRepoRequest"];
type ProbeRepoResponse = NodeApi.components["schemas"]["ProbeRepoResponse"];

/**
 * Mutation hook that probes a repository URL before attach.
 * @returns React Query mutation for {@link ProbeRepoRequest} → {@link ProbeRepoResponse}.
 */
export function useProbeRepo() {
  return useMutation<ProbeRepoResponse, Error, ProbeRepoRequest>({
    mutationFn: (body) => probeRepoRequest(body),
  });
}
