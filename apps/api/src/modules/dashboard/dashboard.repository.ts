import type { Sql } from "../../platform/db";
import { ROW_STATUS } from "../../platform/rowStatus";

/** Aggregate counts computed from the projects table. */
export interface ProjectCounts {
  projectCount: number;
  indexedProjectCount: number;
}

/**
 * Returns aggregate project counts from the database.
 *
 * Project counts are computed here. Knowledge entry totals and session counts
 * are loaded by the dashboard service from their respective modules.
 *
 * @param db - The postgres.js SQL client.
 * @returns {@link ProjectCounts} computed from the `projects` table.
 */
export async function getProjectCounts(db: Sql): Promise<ProjectCounts> {
  const rows = await db<{ total: number; indexed: number }[]>`
    SELECT
      COUNT(*)::int                                            AS total,
      COUNT(*) FILTER (WHERE lifecycle_status = 'indexed')::int AS indexed
    FROM projects
    WHERE status = ${ROW_STATUS.ACTIVE}
  `;
  const row = rows[0];
  return {
    projectCount: row?.total ?? 0,
    indexedProjectCount: row?.indexed ?? 0,
  };
}
