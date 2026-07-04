import type { Sql } from "../../platform/db";
import { ROW_STATUS } from "../../platform/rowStatus";

/** Shape of a row returned from the `projects` table (with computed repo count). */
export interface ProjectRow {
  id: string;
  name: string;
  status: string;
  repo_count: number;
  created_at: Date;
}

/**
 * Returns all active project rows with their attached-repo count, ordered newest first.
 *
 * Uses a LEFT JOIN + GROUP BY rather than a subquery so a single round-trip
 * fetches both the project data and the count (avoids N+1).
 *
 * @param db - The postgres.js SQL client.
 * @returns Array of {@link ProjectRow} (may be empty).
 */
export async function findAllProjects(db: Sql): Promise<ProjectRow[]> {
  return db<ProjectRow[]>`
    SELECT p.id, p.name, p.lifecycle_status AS status, p.created_at,
           COUNT(r.id)::int AS repo_count
    FROM projects p
    LEFT JOIN repos r ON r.project_id = p.id AND r.status = ${ROW_STATUS.ACTIVE}
    WHERE p.status = ${ROW_STATUS.ACTIVE}
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `;
}

/**
 * Finds a single active project by UUID, including its attached-repo count.
 * @param db - The postgres.js SQL client.
 * @param id - Project UUID.
 * @returns The matching {@link ProjectRow}, or `undefined` if not found.
 */
export async function findProjectById(db: Sql, id: string): Promise<ProjectRow | undefined> {
  const rows = await db<ProjectRow[]>`
    SELECT p.id, p.name, p.lifecycle_status AS status, p.created_at,
           COUNT(r.id)::int AS repo_count
    FROM projects p
    LEFT JOIN repos r ON r.project_id = p.id AND r.status = ${ROW_STATUS.ACTIVE}
    WHERE p.id = ${id}
      AND p.status = ${ROW_STATUS.ACTIVE}
    GROUP BY p.id
    LIMIT 1
  `;
  return rows[0];
}

/**
 * Inserts a new project row.
 * @param db - The postgres.js SQL client.
 * @param name - Human-readable project name.
 * @returns The created {@link ProjectRow} (repo_count is 0 for new projects).
 */
export async function insertProject(db: Sql, name: string, actorId: string): Promise<ProjectRow> {
  const rows = await db<ProjectRow[]>`
    INSERT INTO projects (name, created_by, updated_by)
    VALUES (${name}, ${actorId}, ${actorId})
    RETURNING id, name, lifecycle_status AS status, created_at, 0::int AS repo_count
  `;
  const row = rows[0];
  if (!row) {
    throw new Error("Unexpected empty result from project INSERT.");
  }
  return row;
}

/**
 * Soft-deletes a project by setting row status to Deleted.
 * @param db - The postgres.js SQL client.
 * @param id - Project UUID.
 * @returns `true` if an active row was soft-deleted, `false` if none matched.
 */
export async function softDeleteProject(
  db: Sql,
  id: string,
  actorId: string,
): Promise<boolean> {
  const rows = await db<{ id: string }[]>`
    UPDATE projects
    SET status = ${ROW_STATUS.DELETED},
        updated_by = ${actorId}
    WHERE id = ${id}
      AND status = ${ROW_STATUS.ACTIVE}
    RETURNING id
  `;
  return rows.length > 0;
}
