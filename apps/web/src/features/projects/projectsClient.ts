import { apiFetch } from "@/shared/lib/apiClient";
import type { NodeApi } from "@codesage/shared-types";

type Project = NodeApi.components["schemas"]["Project"];
type Repo = NodeApi.components["schemas"]["Repo"];
type AttachRepoResponse = NodeApi.components["schemas"]["AttachRepoResponse"];
type CreateProjectRequest = NodeApi.components["schemas"]["CreateProjectRequest"];
type CreateRepoRequest = NodeApi.components["schemas"]["CreateRepoRequest"];

/**
 * Fetches the list of projects from the Node API.
 * @returns Array of projects (may be empty).
 */
export async function fetchProjects(): Promise<Project[]> {
  return apiFetch<Project[]>("/projects");
}

/**
 * Creates a new project.
 * @param body - Project creation request body.
 * @returns The newly created project.
 */
export async function createProjectRequest(body: CreateProjectRequest): Promise<Project> {
  return apiFetch<Project>("/projects", { method: "POST", body });
}

/**
 * Fetches the list of repos attached to a project.
 * @param projectId - Parent project UUID.
 * @returns Array of repos (may be empty).
 */
export async function fetchRepos(projectId: string): Promise<Repo[]> {
  return apiFetch<Repo[]>(`/projects/${projectId}/repos`);
}

/**
 * Attaches a new repository to a project.
 * @param projectId - Parent project UUID.
 * @param body - Repo attachment request body.
 * @returns The attached repo and the enqueued sync job ID.
 */
export async function attachRepoRequest(
  projectId: string,
  body: CreateRepoRequest,
): Promise<AttachRepoResponse> {
  return apiFetch<AttachRepoResponse>(`/projects/${projectId}/repos`, {
    method: "POST",
    body,
  });
}
