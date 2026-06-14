import type { Sql } from "../../platform/db";
import { ApiError } from "../../platform/errors";
import { encryptToken, parseEncryptionKey } from "../../platform/encryption";
import { enqueueJob } from "../../platform/queue";
import { findProjectById } from "../projects/projects.repository";
import {
  findReposByProject,
  insertRepo,
  deleteRepo,
} from "./repos.repository";
import type { NodeApi } from "@codesage/shared-types";

/** Converts a repository row to the public API response shape. */
function toRepoResponse(row: {
  id: string;
  project_id: string;
  repo_url: string;
  provider: string;
  branch: string;
  role: string;
  last_indexed_sha: string | null;
  created_at: Date;
}): NodeApi.components["schemas"]["Repo"] {
  return {
    id: row.id,
    projectId: row.project_id,
    repoUrl: row.repo_url,
    provider: row.provider as NodeApi.components["schemas"]["RepoProvider"],
    branch: row.branch,
    role: row.role as NodeApi.components["schemas"]["RepoRole"],
    lastIndexedSha: row.last_indexed_sha ?? undefined,
    createdAt: row.created_at.toISOString(),
  };
}

/**
 * Lists all repos attached to a project.
 * @param db - The postgres.js SQL client.
 * @param projectId - Parent project UUID.
 * @returns Array of public repo responses (may be empty).
 * @throws {@link ApiError} 404 when the parent project does not exist.
 */
export async function listRepos(
  db: Sql,
  projectId: string,
): Promise<NodeApi.components["schemas"]["Repo"][]> {
  const project = await findProjectById(db, projectId);
  if (!project) {
    throw new ApiError(404, "NOT_FOUND", "Project not found.");
  }
  const rows = await findReposByProject(db, projectId);
  return rows.map(toRepoResponse);
}

/**
 * Attaches a new repository to a project and enqueues the initial sync job.
 * Repo tokens (if provided) are encrypted at rest using AES-256-GCM before storage;
 * the plaintext token is never logged or persisted.
 *
 * @param db - The postgres.js SQL client.
 * @param projectId - Parent project UUID.
 * @param repoUrl - HTTPS clone URL.
 * @param provider - Git hosting provider.
 * @param branch - Branch to index.
 * @param role - Role this repo plays in the project.
 * @param token - Optional plaintext deploy token (encrypted before storage).
 * @param encryptionKey - Base64-encoded 32-byte AES key from config.
 * @returns The attached repo and the enqueued sync job ID.
 * @throws {@link ApiError} 404 when the parent project does not exist.
 * @throws {@link ApiError} 400 when a token is provided but the encryption key is not configured.
 */
export async function attachRepo(
  db: Sql,
  projectId: string,
  repoUrl: string,
  provider: string,
  branch: string,
  role: string,
  token: string | undefined,
  encryptionKey: string,
): Promise<{ repo: NodeApi.components["schemas"]["Repo"]; jobId: string }> {
  const project = await findProjectById(db, projectId);
  if (!project) {
    throw new ApiError(404, "NOT_FOUND", "Project not found.");
  }

  let tokenEnc: string | null = null;
  if (token) {
    if (!encryptionKey) {
      throw new ApiError(
        400,
        "ENCRYPTION_NOT_CONFIGURED",
        "TOKEN_ENC_KEY must be set to store private repo tokens.",
      );
    }
    const key = parseEncryptionKey(encryptionKey);
    tokenEnc = encryptToken(token, key);
  }

  const row = await insertRepo(db, projectId, repoUrl, provider, branch, role, tokenEnc);
  const jobId = await enqueueJob(db, "sync", { repoId: row.id });

  return { repo: toRepoResponse(row), jobId };
}

/**
 * Detaches a repository from a project.
 * @param db - The postgres.js SQL client.
 * @param projectId - Parent project UUID.
 * @param repoId - Repo UUID.
 * @throws {@link ApiError} 404 when the repo does not exist in the project.
 */
export async function detachRepo(db: Sql, projectId: string, repoId: string): Promise<void> {
  const deleted = await deleteRepo(db, projectId, repoId);
  if (!deleted) {
    throw new ApiError(404, "NOT_FOUND", "Repo not found in this project.");
  }
}
