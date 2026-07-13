import type { FastifyInstance } from "fastify";
import type { NodeApi } from "@codesage/shared-types";
import {
  getDataFlows,
  getPages,
  getPermissions,
  getWorkflows,
} from "./knowledge.service";

type WorkflowEntry = NodeApi.components["schemas"]["WorkflowEntry"];
type PageMapEntry = NodeApi.components["schemas"]["PageMapEntry"];
type PermissionRuleEntry = NodeApi.components["schemas"]["PermissionRuleEntry"];
type DataFlowEntry = NodeApi.components["schemas"]["DataFlowEntry"];

/**
 * Registers read-only derived-knowledge routes for a project.
 *
 * @param app - The Fastify application instance.
 */
export async function knowledgeRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { projectId: string }; Reply: WorkflowEntry[] }>(
    "/projects/:projectId/workflows",
    async (request, reply) => {
      try {
        return await getWorkflows(app.db, request.params.projectId);
      } catch (error) {
        if (error instanceof Error && error.message === "PROJECT_NOT_FOUND") {
          return reply.status(404).send({
            error: { code: "NOT_FOUND", message: "Project not found." },
          } as never);
        }
        throw error;
      }
    },
  );

  app.get<{ Params: { projectId: string }; Reply: PageMapEntry[] }>(
    "/projects/:projectId/pages",
    async (request, reply) => {
      try {
        return await getPages(app.db, request.params.projectId);
      } catch (error) {
        if (error instanceof Error && error.message === "PROJECT_NOT_FOUND") {
          return reply.status(404).send({
            error: { code: "NOT_FOUND", message: "Project not found." },
          } as never);
        }
        throw error;
      }
    },
  );

  app.get<{ Params: { projectId: string }; Reply: PermissionRuleEntry[] }>(
    "/projects/:projectId/permissions",
    async (request, reply) => {
      try {
        return await getPermissions(app.db, request.params.projectId);
      } catch (error) {
        if (error instanceof Error && error.message === "PROJECT_NOT_FOUND") {
          return reply.status(404).send({
            error: { code: "NOT_FOUND", message: "Project not found." },
          } as never);
        }
        throw error;
      }
    },
  );

  app.get<{ Params: { projectId: string }; Reply: DataFlowEntry[] }>(
    "/projects/:projectId/data-flows",
    async (request, reply) => {
      try {
        return await getDataFlows(app.db, request.params.projectId);
      } catch (error) {
        if (error instanceof Error && error.message === "PROJECT_NOT_FOUND") {
          return reply.status(404).send({
            error: { code: "NOT_FOUND", message: "Project not found." },
          } as never);
        }
        throw error;
      }
    },
  );
}
