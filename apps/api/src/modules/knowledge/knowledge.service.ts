import type { Sql } from "../../platform/db";
import type { NodeApi } from "@codesage/shared-types";
import {
  listDataFlows,
  listPages,
  listPermissions,
  listWorkflows,
  projectExists,
} from "./knowledge.repository";

type WorkflowEntry = NodeApi.components["schemas"]["WorkflowEntry"];
type PageMapEntry = NodeApi.components["schemas"]["PageMapEntry"];
type PermissionRuleEntry = NodeApi.components["schemas"]["PermissionRuleEntry"];
type DataFlowEntry = NodeApi.components["schemas"]["DataFlowEntry"];

/**
 * Ensures the project exists or throws a not-found error.
 *
 * @param db - The postgres.js SQL client.
 * @param projectId - Project UUID.
 * @throws Error with message ``PROJECT_NOT_FOUND`` when missing.
 */
async function assertProject(db: Sql, projectId: string): Promise<void> {
  const exists = await projectExists(db, projectId);
  if (!exists) {
    throw new Error("PROJECT_NOT_FOUND");
  }
}

/**
 * Returns distilled workflows for a project.
 *
 * @param db - The postgres.js SQL client.
 * @param projectId - Project UUID.
 * @returns Workflow entries with confidence and citations.
 */
export async function getWorkflows(db: Sql, projectId: string): Promise<WorkflowEntry[]> {
  await assertProject(db, projectId);
  const rows = await listWorkflows(db, projectId);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    steps: row.steps as WorkflowEntry["steps"],
    confidence: Number(row.confidence),
    sourceRefs: row.source_refs as WorkflowEntry["sourceRefs"],
  }));
}

/**
 * Returns distilled page map entries for a project.
 *
 * @param db - The postgres.js SQL client.
 * @param projectId - Project UUID.
 * @returns Page map entries with confidence and citations.
 */
export async function getPages(db: Sql, projectId: string): Promise<PageMapEntry[]> {
  await assertProject(db, projectId);
  const rows = await listPages(db, projectId);
  return rows.map((row) => ({
    id: row.id,
    route: row.route,
    components: row.components as PageMapEntry["components"],
    dataSources: row.data_sources as PageMapEntry["dataSources"],
    confidence: Number(row.confidence),
    sourceRefs: row.source_refs as PageMapEntry["sourceRefs"],
  }));
}

/**
 * Returns distilled permission rules for a project.
 *
 * @param db - The postgres.js SQL client.
 * @param projectId - Project UUID.
 * @returns Permission rule entries with confidence and citations.
 */
export async function getPermissions(
  db: Sql,
  projectId: string,
): Promise<PermissionRuleEntry[]> {
  await assertProject(db, projectId);
  const rows = await listPermissions(db, projectId);
  return rows.map((row) => ({
    id: row.id,
    target: row.target,
    requiredPermission: row.required_permission,
    confidence: Number(row.confidence),
    sourceRefs: row.source_refs as PermissionRuleEntry["sourceRefs"],
  }));
}

/**
 * Returns distilled data flows for a project.
 *
 * @param db - The postgres.js SQL client.
 * @param projectId - Project UUID.
 * @returns Data flow entries with confidence and citations.
 */
export async function getDataFlows(db: Sql, projectId: string): Promise<DataFlowEntry[]> {
  await assertProject(db, projectId);
  const rows = await listDataFlows(db, projectId);
  return rows.map((row) => ({
    id: row.id,
    pageRef: row.page_ref,
    sourceChain: row.source_chain as DataFlowEntry["sourceChain"],
    freshnessType: row.freshness_type as DataFlowEntry["freshnessType"],
    confidence: Number(row.confidence),
    sourceRefs: row.source_refs as DataFlowEntry["sourceRefs"],
  }));
}
