import type { FastifyRequest } from "fastify";
import type { JwtPayload } from "./auth.plugin";
import type { Sql } from "./db";

/** Component keys for internal service accounts (audit attribution). */
export type ServiceComponent = "api" | "rag" | "webhook";

/** Fixed UUID for the Node API system account — must match migration seed. */
export const API_SYSTEM_USER_ID = "a0000001-0000-4000-8000-000000000001";

/** Fixed UUID for the RAG worker account — must match migration seed. */
export const RAG_WORKER_USER_ID = "a0000001-0000-4000-8000-000000000002";

/** Fixed UUID for the webhook handler account — must match migration seed. */
export const WEBHOOK_HANDLER_USER_ID = "a0000001-0000-4000-8000-000000000003";

/** DB-only role for service accounts; not exposed in OpenAPI UserRole. */
export const SYSTEM_USER_ROLE = "system";

/** Registry entry for a seeded service account. */
export interface ServiceUserEntry {
  id: string;
  email: string;
  component: ServiceComponent;
}

/** All internal service users seeded by migration. */
export const SERVICE_USERS: readonly ServiceUserEntry[] = [
  { id: API_SYSTEM_USER_ID, email: "api-system@codesage.internal", component: "api" },
  { id: RAG_WORKER_USER_ID, email: "rag-worker@codesage.internal", component: "rag" },
  {
    id: WEBHOOK_HANDLER_USER_ID,
    email: "webhook-handler@codesage.internal",
    component: "webhook",
  },
] as const;

const SERVICE_USER_IDS = new Set(SERVICE_USERS.map((entry) => entry.id));

const COMPONENT_TO_ID: Record<ServiceComponent, string> = {
  api: API_SYSTEM_USER_ID,
  rag: RAG_WORKER_USER_ID,
  webhook: WEBHOOK_HANDLER_USER_ID,
};

/**
 * Returns the fixed UUID for a component service account (no DB lookup).
 *
 * @param component - Internal writer component key.
 * @returns Service user UUID matching the migration seed.
 */
export function resolveServiceUser(component: ServiceComponent): string {
  return COMPONENT_TO_ID[component];
}

/**
 * Returns true when the id is a known service account UUID.
 *
 * @param id - User UUID to check.
 */
export function isServiceUserId(id: string): boolean {
  return SERVICE_USER_IDS.has(id);
}

/**
 * Returns true when the DB role marks a system (non-human) account.
 *
 * @param role - Value from `users.role`.
 */
export function isServiceUserRole(role: string): boolean {
  return role === SYSTEM_USER_ROLE;
}

/**
 * Resolves the acting user for an API write: human id when provided, else service user.
 *
 * @param actorId - Explicit actor UUID (e.g. from JWT `sub`).
 * @param fallbackComponent - Service component when no human actor is provided.
 * @returns UUID to store in `created_by` / `updated_by`.
 */
export function resolveActorId(
  actorId: string | undefined,
  fallbackComponent: ServiceComponent = "api",
): string {
  if (actorId) {
    return actorId;
  }
  return resolveServiceUser(fallbackComponent);
}

/**
 * Extracts the authenticated human user id from a Fastify request, if any.
 *
 * @param request - Request after JWT verification.
 * @returns User UUID or `undefined` when unauthenticated.
 */
export function actorIdFromRequest(request: FastifyRequest | undefined): string | undefined {
  if (!request?.user) {
    return undefined;
  }
  const payload = request.user as JwtPayload;
  return payload.sub;
}

/**
 * Verifies that all service user rows exist in the database (startup check).
 *
 * @param sql - Active postgres.js client.
 * @throws When any expected service user is missing or not `system` role.
 */
export async function assertServiceUsersExist(sql: Sql): Promise<void> {
  const rows = await sql<{ id: string; role: string }[]>`
    SELECT id, role::text AS role
    FROM users
    WHERE id = ANY(${[...SERVICE_USER_IDS]})
  `;
  const found = new Map(rows.map((row) => [row.id, row.role]));
  for (const entry of SERVICE_USERS) {
    const role = found.get(entry.id);
    if (!role) {
      throw new Error(`Service user missing after migration: ${entry.email} (${entry.id})`);
    }
    if (role !== SYSTEM_USER_ROLE) {
      throw new Error(`Service user ${entry.email} has role ${role}, expected system`);
    }
  }
}
