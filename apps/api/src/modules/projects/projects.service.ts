import type { Sql } from "../../platform/db";
import { ApiError } from "../../platform/errors";
import {
  findAllProjects,
  findProjectById,
  insertProject,
  deleteProject,
} from "./projects.repository";
import type { NodeApi } from "@codesage/shared-types";

/** Converts a repository row to the public API response shape. */
function toProjectResponse(row: {
  id: string;
  name: string;
  status: string;
  created_at: Date;
}): NodeApi.components["schemas"]["Project"] {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    createdAt: row.created_at.toISOString(),
  };
}

/**
 * Returns all projects as public API responses.
 * @param db - The postgres.js SQL client.
 * @returns Array of project responses (may be empty).
 */
export async function listProjects(
  db: Sql,
): Promise<NodeApi.components["schemas"]["Project"][]> {
  const rows = await findAllProjects(db);
  return rows.map(toProjectResponse);
}

/**
 * Returns a single project by ID.
 * @param db - The postgres.js SQL client.
 * @param id - Project UUID.
 * @returns The public project response.
 * @throws {@link ApiError} 404 when the project does not exist.
 */
export async function getProject(
  db: Sql,
  id: string,
): Promise<NodeApi.components["schemas"]["Project"]> {
  const row = await findProjectById(db, id);
  if (!row) {
    throw new ApiError(404, "NOT_FOUND", "Project not found.");
  }
  return toProjectResponse(row);
}

/**
 * Creates a new project.
 * @param db - The postgres.js SQL client.
 * @param name - Human-readable project name.
 * @returns The newly created public project response.
 * @throws {@link ApiError} 400 when the name is blank.
 */
export async function createProject(
  db: Sql,
  name: string,
): Promise<NodeApi.components["schemas"]["Project"]> {
  if (!name.trim()) {
    throw new ApiError(400, "VALIDATION_ERROR", "Project name must not be blank.");
  }
  const row = await insertProject(db, name.trim());
  return toProjectResponse(row);
}

/**
 * Deletes a project by ID.
 * @param db - The postgres.js SQL client.
 * @param id - Project UUID.
 * @throws {@link ApiError} 404 when the project does not exist.
 */
export async function removeProject(db: Sql, id: string): Promise<void> {
  const deleted = await deleteProject(db, id);
  if (!deleted) {
    throw new ApiError(404, "NOT_FOUND", "Project not found.");
  }
}
