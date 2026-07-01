import { useQuery } from "@tanstack/react-query";
import { fetchProjects } from "@/features/projects/projectsClient";
import { chatKeys } from "./chatKeys";

/**
 * Lists projects for chat session scoping (real API).
 * @returns TanStack query result with project list.
 */
export function useProjects() {
  return useQuery({
    queryKey: chatKeys.projects,
    queryFn: fetchProjects,
  });
}
