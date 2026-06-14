import { useQuery } from "@tanstack/react-query";
import { listProjects, type Project } from "@/shared/mock";
import { chatKeys } from "./chatKeys";

/**
 * Lists connected projects, used to scope a new conversation.
 * @returns The TanStack Query result for the project list.
 */
export function useProjects() {
  return useQuery<Project[], Error>({
    queryKey: chatKeys.projects,
    queryFn: () => listProjects(),
  });
}
