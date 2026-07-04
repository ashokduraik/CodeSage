import type { Sql } from "./db";

/**
 * Valid job types that can be enqueued.
 * Each maps to a consumer in apps/rag.
 * Shapes of the payloads are defined in contracts/jobs.schema.json.
 */
export type JobType = "sync" | "parse" | "embed" | "xrepo" | "distill";

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
