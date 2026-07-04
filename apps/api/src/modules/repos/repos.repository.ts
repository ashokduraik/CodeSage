import type { Sql } from "../../platform/db";
import { ROW_STATUS } from "../../platform/rowStatus";

/** Shape of a row returned from the `repos` table (no secrets in public API). */
export interface RepoRow {
  id: string;
  project_id: string;
  repo_url: string;
  provider: string;
  branch: string;
  full_name: string | null;
  description: string | null;
  base_url: string | null;
  is_private: boolean;
  connection_status: string;
  last_error: string | null;
  last_error_at: Date | null;
  webhook_id: string | null;
  webhook_enabled: boolean;
  last_indexed_sha: string | null;
  last_indexed_at: Date | null;
  primary_language: string | null;
  status: string;
  created_at: Date;
}

/** Repo row with computed indexed file count for list responses. */
export interface RepoListRow extends RepoRow {
  indexed_file_count: number;
}

/** Repo row including encrypted secrets — never exposed via API. */
export interface RepoSecretRow extends RepoRow {
  token_enc: Buffer | null;
  webhook_secret_enc: Buffer | null;
}

/** Fields supplied when inserting a new repo. */
export interface InsertRepoParams {
  projectId: string;
  repoUrl: string;
  provider: string;
  branch: string;
  fullName: string;
  description: string | null;
  baseUrl: string | null;
  isPrivate: boolean;
  tokenEnc: string | null;
  primaryLanguage: string | null;
}

const REPO_COLUMNS = `
  id, project_id, repo_url, provider, branch,
  full_name, description, base_url, is_private,
  connection_status, last_error, last_error_at,
  webhook_id, webhook_enabled,
  last_indexed_sha, last_indexed_at, primary_language,
  status, created_at
`;

/**
 * Returns all active repos belonging to a project, ordered by creation time.
 *
 * @param db - The postgres.js SQL client.
 * @param projectId - Parent project UUID.
 * @returns Array of {@link RepoListRow} with indexed file counts (may be empty).
 */
export async function findReposByProject(db: Sql, projectId: string): Promise<RepoListRow[]> {
  return db<RepoListRow[]>`
    SELECT ${db.unsafe(REPO_COLUMNS)},
           COALESCE(fc.indexed_file_count, 0)::int AS indexed_file_count
    FROM repos r
    LEFT JOIN (
      SELECT repo_id, COUNT(DISTINCT file_path)::int AS indexed_file_count
      FROM code_chunks
      GROUP BY repo_id
    ) fc ON fc.repo_id = r.id
    WHERE r.project_id = ${projectId}
      AND r.status = ${ROW_STATUS.ACTIVE}
    ORDER BY r.created_at ASC
  `;
}

/**
 * Finds a single active repo by its UUID, verifying it belongs to the expected project.
 *
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
    SELECT ${db.unsafe(REPO_COLUMNS)}
    FROM repos
    WHERE id = ${repoId}
      AND project_id = ${projectId}
      AND status = ${ROW_STATUS.ACTIVE}
    LIMIT 1
  `;
  return rows[0];
}

/**
 * Finds an active repo by clone URL for inbound webhook routing.
 *
 * @param db - The postgres.js SQL client.
 * @param repoUrl - Normalized HTTPS clone URL.
 * @returns Matching row with secrets, or `undefined`.
 */
export async function findRepoByUrl(db: Sql, repoUrl: string): Promise<RepoSecretRow | undefined> {
  const rows = await db<RepoSecretRow[]>`
    SELECT ${db.unsafe(REPO_COLUMNS)},
           token_enc, webhook_secret_enc
    FROM repos
    WHERE repo_url = ${repoUrl}
      AND webhook_enabled = true
      AND status = ${ROW_STATUS.ACTIVE}
    LIMIT 1
  `;
  return rows[0];
}

/**
 * Loads an active repo with encrypted secrets before detach (for webhook cleanup).
 *
 * @param db - The postgres.js SQL client.
 * @param projectId - Parent project UUID.
 * @param repoId - Repo UUID.
 * @returns Row with secrets, or `undefined`.
 */
export async function findRepoSecretsById(
  db: Sql,
  projectId: string,
  repoId: string,
): Promise<RepoSecretRow | undefined> {
  const rows = await db<RepoSecretRow[]>`
    SELECT ${db.unsafe(REPO_COLUMNS)},
           token_enc, webhook_secret_enc
    FROM repos
    WHERE id = ${repoId}
      AND project_id = ${projectId}
      AND status = ${ROW_STATUS.ACTIVE}
    LIMIT 1
  `;
  return rows[0];
}

/**
 * Inserts a new repo row, optionally storing an encrypted deploy token.
 *
 * @param db - The postgres.js SQL client.
 * @param params - Insert parameters.
 * @returns The created {@link RepoRow}.
 */
export async function insertRepo(db: Sql, params: InsertRepoParams, actorId: string): Promise<RepoRow> {
  const rows = await db<RepoRow[]>`
    INSERT INTO repos (
      project_id, repo_url, provider, branch,
      full_name, description, base_url, is_private,
      connection_status, token_enc, primary_language,
      created_by, updated_by
    )
    VALUES (
      ${params.projectId},
      ${params.repoUrl},
      ${params.provider},
      ${params.branch},
      ${params.fullName},
      ${params.description},
      ${params.baseUrl},
      ${params.isPrivate},
      'connecting',
      ${params.tokenEnc ? Buffer.from(params.tokenEnc, "utf8") : null},
      ${params.primaryLanguage},
      ${actorId},
      ${actorId}
    )
    RETURNING ${db.unsafe(REPO_COLUMNS)}
  `;
  const row = rows[0];
  if (!row) {
    throw new Error("Unexpected empty result from repo INSERT.");
  }
  return row;
}

/**
 * Updates webhook registration fields after a successful provider hook create.
 *
 * @param db - The postgres.js SQL client.
 * @param repoId - Repo UUID.
 * @param webhookId - Provider-assigned hook ID.
 * @param webhookSecretEnc - Encrypted HMAC secret.
 */
export async function updateRepoWebhook(
  db: Sql,
  repoId: string,
  webhookId: string,
  webhookSecretEnc: string,
  actorId: string,
): Promise<void> {
  await db`
    UPDATE repos
    SET webhook_id = ${webhookId},
        webhook_secret_enc = ${Buffer.from(webhookSecretEnc, "utf8")},
        webhook_enabled = true,
        updated_by = ${actorId}
    WHERE id = ${repoId}
  `;
}

/**
 * Sets connection status to connecting before a manual or webhook-triggered sync.
 *
 * @param db - The postgres.js SQL client.
 * @param repoId - Repo UUID.
 */
export async function setRepoConnecting(db: Sql, repoId: string, actorId: string): Promise<void> {
  await db`
    UPDATE repos
    SET connection_status = 'connecting',
        last_error = NULL,
        last_error_at = NULL,
        updated_by = ${actorId}
    WHERE id = ${repoId}
      AND status = ${ROW_STATUS.ACTIVE}
  `;
}

/**
 * Soft-deletes a repo by setting row status to Deleted, scoped to the parent project.
 *
 * @param db - The postgres.js SQL client.
 * @param projectId - Parent project UUID (enforces ownership).
 * @param repoId - Repo UUID.
 * @returns `true` if a row was soft-deleted, `false` if no active row matched.
 */
export async function softDeleteRepo(
  db: Sql,
  projectId: string,
  repoId: string,
  actorId: string,
): Promise<boolean> {
  const rows = await db<{ id: string }[]>`
    UPDATE repos
    SET status = ${ROW_STATUS.DELETED},
        webhook_enabled = false,
        webhook_id = NULL,
        updated_by = ${actorId}
    WHERE id = ${repoId}
      AND project_id = ${projectId}
      AND status = ${ROW_STATUS.ACTIVE}
    RETURNING id
  `;
  return rows.length > 0;
}

/** Row shape from `repo_indexing_events` for API mapping. */
export interface RepoIndexingEventRow {
  id: string;
  run_id: string;
  step: string;
  phase: string;
  started_at: Date;
  duration_ms: number | null;
  message: string;
  failure_reason: string | null;
  trigger: string | null;
  details: Record<string, unknown> | null;
}

/** Parameters for cursor-paginated indexing event queries. */
export interface FindIndexingEventsParams {
  limit: number;
  cursorStartedAt?: Date;
  cursorId?: string;
}

const INDEXING_EVENT_COLUMNS = `
  id, run_id, step, phase, started_at, duration_ms,
  message, failure_reason, trigger, details
`;

/**
 * Fetches indexing progress events for a repo, newest first.
 * Fetches one extra row so the service can derive hasMore without COUNT(*).
 *
 * @param db - The postgres.js SQL client.
 * @param projectId - Parent project UUID (ownership scope).
 * @param repoId - Repo UUID.
 * @param params - Page size and optional cursor from the previous page.
 * @returns Matching event rows (may include one extra row for pagination).
 */
export async function findIndexingEventsByRepo(
  db: Sql,
  projectId: string,
  repoId: string,
  params: FindIndexingEventsParams,
): Promise<RepoIndexingEventRow[]> {
  const { limit, cursorStartedAt, cursorId } = params;

  if (cursorStartedAt && cursorId) {
    return db<RepoIndexingEventRow[]>`
      SELECT ${db.unsafe(INDEXING_EVENT_COLUMNS)}
      FROM repo_indexing_events
      WHERE repo_id = ${repoId}
        AND project_id = ${projectId}
        AND status = ${ROW_STATUS.ACTIVE}
        AND (started_at, id) < (${cursorStartedAt}, ${cursorId}::uuid)
      ORDER BY started_at DESC, id DESC
      LIMIT ${limit}
    `;
  }

  return db<RepoIndexingEventRow[]>`
    SELECT ${db.unsafe(INDEXING_EVENT_COLUMNS)}
    FROM repo_indexing_events
    WHERE repo_id = ${repoId}
      AND project_id = ${projectId}
      AND status = ${ROW_STATUS.ACTIVE}
    ORDER BY started_at DESC, id DESC
    LIMIT ${limit}
  `;
}
