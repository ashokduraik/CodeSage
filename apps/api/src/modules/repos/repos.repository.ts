import type { Sql } from "../../platform/db";

/** Shape of a row returned from the `repos` table (no token — never returned). */
export interface RepoRow {
  id: string;
  project_id: string;
  repo_url: string;
  provider: string;
  branch: string;
  role: string;
  last_indexed_sha: string | null;
  created_at: Date;
}

/**
 * Returns all repos belonging to a project, ordered by creation time.
 * @param db - The postgres.js SQL client.
 * @param projectId - Parent project UUID.
 * @returns Array of {@link RepoRow} (may be empty).
 */
export async function findReposByProject(db: Sql, projectId: string): Promise<RepoRow[]> {
  return db<RepoRow[]>`
    SELECT id, project_id, repo_url, provider, branch, role, last_indexed_sha, created_at
    FROM repos
    WHERE project_id = ${projectId}
    ORDER BY created_at ASC
  `;
}

/**
 * Finds a single repo by its UUID, verifying it belongs to the expected project.
 * @param db - The postgres.js SQL client.
 * @param projectId - Parent project UUID (enforces ownership).
 * @param repoId - Repo UUID.
 * @returns The matching {@link RepoRow}, or `undefined` if not found.
 */
export async function findRepoById(
  db: Sql,
  projectId: string,
  repoId: string,
): Promise<RepoRow | undefined> {
  const rows = await db<RepoRow[]>`
    SELECT id, project_id, repo_url, provider, branch, role, last_indexed_sha, created_at
    FROM repos
    WHERE id = ${repoId} AND project_id = ${projectId}
    LIMIT 1
  `;
  return rows[0];
}

/**
 * Inserts a new repo row, optionally storing an encrypted deploy token.
 * The plaintext token is **never** stored; only the AES-256-GCM ciphertext is persisted.
 * @param db - The postgres.js SQL client.
 * @param projectId - Parent project UUID.
 * @param repoUrl - HTTPS clone URL.
 * @param provider - Git hosting provider.
 * @param branch - Branch to index.
 * @param role - Role this repo plays in the project.
 * @param tokenEnc - AES-256-GCM encrypted token string, or `null` for public repos.
 * @returns The created {@link RepoRow}.
 */
export async function insertRepo(
  db: Sql,
  projectId: string,
  repoUrl: string,
  provider: string,
  branch: string,
  role: string,
  tokenEnc: string | null,
): Promise<RepoRow> {
  const rows = await db<RepoRow[]>`
    INSERT INTO repos (project_id, repo_url, provider, branch, role, token_enc)
    VALUES (
      ${projectId},
      ${repoUrl},
      ${provider},
      ${branch},
      ${role},
      ${tokenEnc ? Buffer.from(tokenEnc, "utf8") : null}
    )
    RETURNING id, project_id, repo_url, provider, branch, role, last_indexed_sha, created_at
  `;
  const row = rows[0];
  if (!row) {
    throw new Error("Unexpected empty result from repo INSERT.");
  }
  return row;
}

/**
 * Deletes a repo row, scoped to the parent project.
 * @param db - The postgres.js SQL client.
 * @param projectId - Parent project UUID (enforces ownership).
 * @param repoId - Repo UUID.
 * @returns `true` if a row was deleted, `false` if no row matched.
 */
export async function deleteRepo(
  db: Sql,
  projectId: string,
  repoId: string,
): Promise<boolean> {
  const rows = await db<{ id: string }[]>`
    DELETE FROM repos WHERE id = ${repoId} AND project_id = ${projectId} RETURNING id
  `;
  return rows.length > 0;
}
