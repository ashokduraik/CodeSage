import type { Sql } from "../../platform/db";
import { ROW_STATUS } from "../../platform/rowStatus";

/** Filters applied when listing audit log rows. */
export interface AuditLogFilters {
  actorId?: string;
  action?: string;
  tsFrom: Date;
  tsTo: Date;
}

/** Raw row from audit_log joined with users for actor email. */
export interface AuditLogRow {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  target: string | null;
  ts: Date;
}

/**
 * Returns audit log rows matching filters, ordered newest first.
 * Fetches one extra row so the service can derive {@code hasMore} without COUNT(*).
 *
 * @param db - postgres.js client.
 * @param filters - Scoped filter predicate (including date window).
 * @param limit - Maximum rows to return (typically pageSize + 1).
 * @param offset - Zero-based offset for pagination.
 */
export async function findAuditLogs(
  db: Sql,
  filters: AuditLogFilters,
  limit: number,
  offset: number,
): Promise<AuditLogRow[]> {
  const actorClause = filters.actorId
    ? db`AND a.actor_id = ${filters.actorId}`
    : db``;
  const actionClause = filters.action ? db`AND a.action = ${filters.action}` : db``;

  return db<AuditLogRow[]>`
    SELECT a.id,
           a.actor_id,
           u.email AS actor_email,
           a.action,
           a.target,
           a.ts
    FROM audit_log a
    LEFT JOIN users u ON u.id = a.actor_id
    WHERE a.status = ${ROW_STATUS.ACTIVE}
      AND a.ts >= ${filters.tsFrom}
      AND a.ts <= ${filters.tsTo}
      ${actorClause}
      ${actionClause}
    ORDER BY a.ts DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `;
}
