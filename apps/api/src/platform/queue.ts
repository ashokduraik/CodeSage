import type { Sql } from "./db";

/**
 * Valid job types that can be enqueued.
 * Each maps to a consumer in apps/engine.
 * Shapes of the payloads are defined in contracts/jobs.schema.json.
 */
export type JobType = "sync" | "parse" | "embed" | "xrepo" | "distill" | "repo_cleanup";

/** User-facing message stored on superseded pending job rows. */
export const SUPERSEDED_JOB_MESSAGE = "Superseded by newer indexing run";

/** Active queue row used for re-index throttling and supersession. */
export interface ActiveJobRow {
  id: string;
  job_status: string;
  created_at: Date;
  locked_at: Date | null;
}

/**
 * Returns pending or running active jobs for one repository.
 *
 * @param db - The postgres.js SQL client.
 * @param repoId - Repository UUID from job payloads.
 * @returns Matching active job rows ordered by creation time.
 */
export async function findActiveJobsForRepo(
  db: Sql,
  repoId: string,
): Promise<ActiveJobRow[]> {
  return db<ActiveJobRow[]>`
    SELECT id, job_status, created_at, locked_at
    FROM jobs
    WHERE status = 'A'
      AND job_status IN ('pending', 'running')
      AND payload->>'repoId' = ${repoId}
    ORDER BY created_at
  `;
}

/**
 * Soft-deletes pending jobs for a repository so a newer run can take over.
 *
 * @param db - The postgres.js SQL client.
 * @param repoId - Repository UUID from job payloads.
 * @param actorId - User or service UUID performing the cancellation.
 * @returns Number of rows cancelled.
 */
export async function cancelPendingJobsForRepo(
  db: Sql,
  repoId: string,
  actorId: string,
): Promise<number> {
  const rows = await db<{ id: string }[]>`
    UPDATE jobs
    SET status = 'D',
        error_message = ${SUPERSEDED_JOB_MESSAGE},
        updated_by = ${actorId}
    WHERE status = 'A'
      AND job_status = 'pending'
      AND type <> 'repo_cleanup'
      AND payload->>'repoId' = ${repoId}
    RETURNING id
  `;
  return rows.length;
}

/**
 * Soft-deletes pending project-scoped jobs when a project is deleted.
 *
 * @param db - The postgres.js SQL client.
 * @param projectId - Project UUID from job payloads.
 * @param actorId - User or service UUID performing the cancellation.
 * @returns Number of rows cancelled.
 */
export async function cancelPendingJobsForProject(
  db: Sql,
  projectId: string,
  actorId: string,
): Promise<number> {
  const rows = await db<{ id: string }[]>`
    UPDATE jobs
    SET status = 'D',
        error_message = ${SUPERSEDED_JOB_MESSAGE},
        updated_by = ${actorId}
    WHERE status = 'A'
      AND job_status = 'pending'
      AND type IN ('xrepo', 'distill')
      AND payload->>'projectId' = ${projectId}
    RETURNING id
  `;
  return rows.length;
}

/**
 * Returns true when a job was created or locked within the stale window.
 *
 * @param job - Active job row from the queue.
 * @param staleSeconds - Minimum age before manual re-index is allowed.
 * @param nowMs - Optional current time for tests.
 * @returns True when the job is still considered in progress.
 */
export function isJobYoungerThanStaleThreshold(
  job: ActiveJobRow,
  staleSeconds: number,
  nowMs: number = Date.now(),
): boolean {
  const referenceMs = job.locked_at?.getTime() ?? job.created_at.getTime();
  return nowMs - referenceMs < staleSeconds * 1000;
}

/**
 * Returns true when any active job for a repo is younger than the stale window.
 *
 * @param jobs - Active jobs for one repository.
 * @param staleSeconds - Minimum age before manual re-index is allowed.
 * @param nowMs - Optional current time for tests.
 * @returns True when manual re-index should be rejected.
 */
export function hasActiveJobsWithinStaleWindow(
  jobs: ActiveJobRow[],
  staleSeconds: number,
  nowMs?: number,
): boolean {
  return jobs.some((job) => isJobYoungerThanStaleThreshold(job, staleSeconds, nowMs));
}

/**
 * Enqueues a new job row into the Postgres job queue (ADR 0006).
 * Workers claim rows with `SELECT ... FOR UPDATE SKIP LOCKED`.
 *
 * Node never blocks on heavy work — this is intentionally a fast INSERT.
 * The Python worker picks it up asynchronously.
 *
 * @param db - The postgres.js SQL client (connection pool).
 * @param type - The job type consumed by the appropriate Python worker.
 * @param payload - Type-specific payload object; must conform to `contracts/jobs.schema.json`.
 * @returns The UUID of the newly created job row.
 */
export async function enqueueJob(
  db: Sql,
  type: JobType,
  payload: Record<string, unknown>,
  actorId: string,
): Promise<string> {
  const rows = await db<{ id: string }[]>`
    INSERT INTO jobs (type, payload, created_by, updated_by)
    VALUES (
      ${type},
      ${db.json(payload as Parameters<typeof db.json>[0])},
      ${actorId},
      ${actorId}
    )
    RETURNING id
  `;
  const row = rows[0];
  if (!row) {
    throw new Error("Unexpected empty result from job INSERT.");
  }
  return row.id;
}
