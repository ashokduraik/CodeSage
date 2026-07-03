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
 * Sessions, knowledge entries, and expert reviews are not yet stored in the
 * database (Phase 1+), so their counts are not computed here. The service layer
 * returns zeros for those fields until the corresponding tables exist.
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
