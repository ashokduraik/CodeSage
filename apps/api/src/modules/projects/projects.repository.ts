import type { Sql } from "../../platform/db";

/** Shape of a row returned from the `projects` table. */
export interface ProjectRow {
  id: string;
  name: string;
  status: string;
  created_at: Date;
}

/**
 * Returns all project rows, ordered newest first.
 * @param db - The postgres.js SQL client.
 * @returns Array of {@link ProjectRow} (may be empty).
 */
export async function findAllProjects(db: Sql): Promise<ProjectRow[]> {
  return db<ProjectRow[]>`
    SELECT id, name, status, created_at
    FROM projects
    ORDER BY created_at DESC
  `;
}

/**
 * Finds a single project by UUID.
 * @param db - The postgres.js SQL client.
 * @param id - Project UUID.
 * @returns The matching {@link ProjectRow}, or `undefined` if not found.
 */
export async function findProjectById(db: Sql, id: string): Promise<ProjectRow | undefined> {
  const rows = await db<ProjectRow[]>`
    SELECT id, name, status, created_at
    FROM projects
    WHERE id = ${id}
    LIMIT 1
  `;
  return rows[0];
}

/**
 * Inserts a new project row.
 * @param db - The postgres.js SQL client.
 * @param name - Human-readable project name.
 * @returns The created {@link ProjectRow}.
 */
export async function insertProject(db: Sql, name: string): Promise<ProjectRow> {
  const rows = await db<ProjectRow[]>`
    INSERT INTO projects (name)
    VALUES (${name})
    RETURNING id, name, status, created_at
  `;
  const row = rows[0];
  if (!row) {
    throw new Error("Unexpected empty result from project INSERT.");
  }
  return row;
}

/**
 * Deletes a project by UUID.
 * @param db - The postgres.js SQL client.
 * @param id - Project UUID.
 * @returns `true` if a row was deleted, `false` if no row matched.
 */
export async function deleteProject(db: Sql, id: string): Promise<boolean> {
  const rows = await db<{ id: string }[]>`
    DELETE FROM projects WHERE id = ${id} RETURNING id
  `;
  return rows.length > 0;
}
