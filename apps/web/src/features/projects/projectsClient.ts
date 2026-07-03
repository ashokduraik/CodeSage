import { apiFetch } from "@/shared/lib/apiClient";
import type { NodeApi } from "@codesage/shared-types";

type Project = NodeApi.components["schemas"]["Project"];
type Repo = NodeApi.components["schemas"]["Repo"];
type AttachRepoResponse = NodeApi.components["schemas"]["AttachRepoResponse"];
type CreateProjectRequest = NodeApi.components["schemas"]["CreateProjectRequest"];
type CreateRepoRequest = NodeApi.components["schemas"]["CreateRepoRequest"];
type ProbeRepoRequest = NodeApi.components["schemas"]["ProbeRepoRequest"];
type ProbeRepoResponse = NodeApi.components["schemas"]["ProbeRepoResponse"];
type SyncRepoResponse = NodeApi.components["schemas"]["SyncRepoResponse"];

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
 * Probes a repository URL before attach (branches, README, auth check).
 * @param body - Probe request with URL and optional token.
 * @returns Probe metadata for the connect wizard.
 */
export async function probeRepoRequest(body: ProbeRepoRequest): Promise<ProbeRepoResponse> {
  return apiFetch<ProbeRepoResponse>("/repos/probe", { method: "POST", body });
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

/**
 * Enqueues a manual sync job for a repository.
 * @param projectId - Parent project UUID.
 * @param repoId - Repo UUID.
 * @returns The enqueued sync job ID.
 */
export async function syncRepoRequest(
  projectId: string,
  repoId: string,
): Promise<SyncRepoResponse> {
  return apiFetch<SyncRepoResponse>(`/projects/${projectId}/repos/${repoId}/sync`, {
    method: "POST",
  });
}

/**
 * Soft-detaches a repository from a project.
 * @param projectId - Parent project UUID.
 * @param repoId - Repo UUID.
 */
export async function deleteRepoRequest(projectId: string, repoId: string): Promise<void> {
  await apiFetch<void>(`/projects/${projectId}/repos/${repoId}`, { method: "DELETE" });
}

/**
 * Soft-deletes a project and detaches all of its repositories.
 * @param projectId - Project UUID.
 */
export async function deleteProjectRequest(projectId: string): Promise<void> {
  await apiFetch<void>(`/projects/${projectId}`, { method: "DELETE" });
}

/** React Query key for repos belonging to a project. */
export function reposQueryKey(projectId: string): readonly ["projects", string, "repos"] {
  return ["projects", projectId, "repos"];
}
