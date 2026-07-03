import type { Sql } from "./db";

/** Well-known audit action identifiers for sensitive API operations. */
export const AUDIT_ACTIONS = {
  USER_CREATE: "user.create",
  USER_ROLE_CHANGE: "user.role_change",
  PROJECT_CREATE: "project.create",
  PROJECT_DELETE: "project.delete",
  REPO_ATTACH: "repo.attach",
  REPO_DETACH: "repo.detach",
  REPO_SYNC: "repo.sync",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

/**
 * Persists a security audit event for a sensitive action.
 *
 * @param db - The postgres.js SQL client.
 * @param actorId - UUID of the authenticated user performing the action.
 * @param action - Machine-readable action identifier (see {@link AUDIT_ACTIONS}).
 * @param target - Optional target descriptor (e.g. resource UUID or composite key).
 * @returns The generated audit row UUID.
 * @throws When the INSERT returns no row.
 */
export async function appendAuditLog(
  db: Sql,
  actorId: string,
  action: AuditAction,
  target?: string,
): Promise<string> {
  const rows = await db<{ id: string }[]>`
    INSERT INTO audit_log (actor_id, action, target)
    VALUES (${actorId}, ${action}, ${target ?? null})
    RETURNING id
  `;
  const row = rows[0];
  if (!row) {
    throw new Error("Unexpected empty result from audit_log INSERT.");
  }
  return row.id;
}
