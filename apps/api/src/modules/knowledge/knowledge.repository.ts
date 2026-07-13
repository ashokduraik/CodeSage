import type { Sql } from "../../platform/db";
import { ROW_STATUS } from "../../platform/rowStatus";

/** Shared columns for derived-knowledge rows returned by the API. */
interface DerivedRow {
  id: string;
  confidence: string;
  source_refs: unknown;
}

/**
 * Returns true when an active project row exists.
 *
 * @param db - The postgres.js SQL client.
 * @param projectId - Project UUID.
 * @returns Whether the project is active.
 */
export async function projectExists(db: Sql, projectId: string): Promise<boolean> {
  const rows = await db<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM projects
      WHERE id = ${projectId}::uuid AND status = ${ROW_STATUS.ACTIVE}
    ) AS exists
  `;
  return rows[0]?.exists ?? false;
}

/**
 * Counts all active derived-knowledge rows across projects.
 *
 * @param db - The postgres.js SQL client.
 * @returns Total knowledge entry count for dashboard stats.
 */
export async function countAllKnowledgeEntries(db: Sql): Promise<number> {
  const rows = await db<{ total: number }[]>`
    SELECT (
      (SELECT COUNT(*)::int FROM workflows WHERE status = ${ROW_STATUS.ACTIVE})
      + (SELECT COUNT(*)::int FROM page_map WHERE status = ${ROW_STATUS.ACTIVE})
      + (SELECT COUNT(*)::int FROM permission_rules WHERE status = ${ROW_STATUS.ACTIVE})
      + (SELECT COUNT(*)::int FROM data_flows WHERE status = ${ROW_STATUS.ACTIVE})
    ) AS total
  `;
  return rows[0]?.total ?? 0;
}

/**
 * Lists active workflows for a project ordered by name.
 *
 * @param db - The postgres.js SQL client.
 * @param projectId - Project UUID.
 * @returns Workflow rows from the database.
 */
export async function listWorkflows(
  db: Sql,
  projectId: string,
): Promise<(DerivedRow & { name: string; steps: unknown })[]> {
  return db<(DerivedRow & { name: string; steps: unknown })[]>`
    SELECT id, name, steps, confidence::text, source_refs
    FROM workflows
    WHERE project_id = ${projectId}::uuid AND status = ${ROW_STATUS.ACTIVE}
    ORDER BY name
  `;
}

/**
 * Lists active page map rows for a project ordered by route.
 *
 * @param db - The postgres.js SQL client.
 * @param projectId - Project UUID.
 * @returns Page map rows from the database.
 */
export async function listPages(
  db: Sql,
  projectId: string,
): Promise<(DerivedRow & { route: string; components: unknown; data_sources: unknown })[]> {
  return db<(DerivedRow & { route: string; components: unknown; data_sources: unknown })[]>`
    SELECT id, route, components, data_sources, confidence::text, source_refs
    FROM page_map
    WHERE project_id = ${projectId}::uuid AND status = ${ROW_STATUS.ACTIVE}
    ORDER BY route
  `;
}

/**
 * Lists active permission rules for a project ordered by target.
 *
 * @param db - The postgres.js SQL client.
 * @param projectId - Project UUID.
 * @returns Permission rule rows from the database.
 */
export async function listPermissions(
  db: Sql,
  projectId: string,
): Promise<(DerivedRow & { target: string; required_permission: string })[]> {
  return db<(DerivedRow & { target: string; required_permission: string })[]>`
    SELECT id, target, required_permission, confidence::text, source_refs
    FROM permission_rules
    WHERE project_id = ${projectId}::uuid AND status = ${ROW_STATUS.ACTIVE}
    ORDER BY target
  `;
}

/**
 * Lists active data flows for a project ordered by page reference.
 *
 * @param db - The postgres.js SQL client.
 * @param projectId - Project UUID.
 * @returns Data flow rows from the database.
 */
export async function listDataFlows(
  db: Sql,
  projectId: string,
): Promise<(DerivedRow & { page_ref: string; source_chain: unknown; freshness_type: string })[]> {
  return db<(DerivedRow & { page_ref: string; source_chain: unknown; freshness_type: string })[]>`
    SELECT id, page_ref, source_chain, freshness_type, confidence::text, source_refs
    FROM data_flows
    WHERE project_id = ${projectId}::uuid AND status = ${ROW_STATUS.ACTIVE}
    ORDER BY page_ref
  `;
}
