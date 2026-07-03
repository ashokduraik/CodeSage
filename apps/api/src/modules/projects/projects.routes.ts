import type { FastifyInstance } from "fastify";
import { listProjects, getProject, createProject, removeProject } from "./projects.service";
import { MOCK_PROJECTS } from "../../platform/mock-data";
import { appendAuditLog, AUDIT_ACTIONS } from "../../platform/audit";
import type { JwtPayload } from "../../platform/auth.plugin";
import type { NodeApi } from "@codesage/shared-types";

type Project = NodeApi.components["schemas"]["Project"];

/**
 * Fastify plugin that registers project CRUD routes.
 *
 * JWT authentication is enforced by the global auth middleware in `platform/auth.middleware.ts`.
 * When {@link AppConfig.mockMode} is enabled the list endpoint returns static mock data
 * instead of querying the database.
 *
 * Routes:
 * - `GET /projects` — list all projects.
 * - `POST /projects` — create a new project.
 * - `GET /projects/:projectId` — get a project by ID.
 * - `DELETE /projects/:projectId` — soft-delete a project and detach its repos.
 *
 * @param app - The Fastify application instance.
 */
export async function projectsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Reply: Project[] }>("/projects", async () => {
    if (app.config.mockMode) {
      return MOCK_PROJECTS as Project[];
    }
    return listProjects(app.db);
  });

  app.post<{ Body: NodeApi.components["schemas"]["CreateProjectRequest"]; Reply: Project }>(
    "/projects",
    async (request, reply) => {
      const { name } = request.body;
      if (!name) {
        return reply.status(400).send({
          error: { code: "VALIDATION_ERROR", message: "name is required." },
        } as never);
      }
      const project = await createProject(app.db, name);
      const { sub } = request.user as JwtPayload;
      await appendAuditLog(app.db, sub, AUDIT_ACTIONS.PROJECT_CREATE, project.id);
      return reply.status(201).send(project);
    },
  );

  app.get<{ Params: { projectId: string }; Reply: Project }>(
    "/projects/:projectId",
    async (request) => getProject(app.db, request.params.projectId),
  );

  app.delete<{ Params: { projectId: string } }>(
    "/projects/:projectId",
    async (request, reply) => {
      const { projectId } = request.params;
      await removeProject(app.db, projectId, app.config.encryptionKey);
      const { sub } = request.user as JwtPayload;
      await appendAuditLog(app.db, sub, AUDIT_ACTIONS.PROJECT_DELETE, projectId);
      return reply.status(204).send();
    },
  );
}
