import type { FastifyInstance } from "fastify";
import { requireRoles } from "../../platform/auth.plugin";
import { listAuditLogs } from "./audit.service";
import type { NodeApi } from "@codesage/shared-types";

type AuditLogListResponse = NodeApi.components["schemas"]["AuditLogListResponse"];

/**
 * Registers admin-only audit log read routes.
 *
 * @param app - Fastify instance.
 */
export async function auditRoutes(app: FastifyInstance): Promise<void> {
  app.get<{
    Querystring: {
      actorId?: string;
      action?: string;
      tsFrom?: string;
      tsTo?: string;
      page?: string;
      pageSize?: string;
    };
    Reply: AuditLogListResponse;
  }>("/audit-logs", { preHandler: requireRoles(["admin"]) }, async (request) => {
    const { actorId, action, tsFrom, tsTo, page, pageSize } = request.query;
    return listAuditLogs(app.db, {
      actorId,
      action,
      tsFrom,
      tsTo,
      page: page !== undefined ? Number(page) : undefined,
      pageSize: pageSize !== undefined ? Number(pageSize) : undefined,
    });
  });
}
