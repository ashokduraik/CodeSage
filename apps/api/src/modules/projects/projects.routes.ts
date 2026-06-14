import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../platform/auth.plugin";
import { listProjects, getProject, createProject, removeProject } from "./projects.service";
import type { NodeApi } from "@codesage/shared-types";

/**
 * Fastify plugin that registers project CRUD routes.
 *
 * All routes require a valid JWT (any authenticated role may manage projects in the MVP).
 *
 * Routes:
 * - `GET /projects` — list all projects.
 * - `POST /projects` — create a new project.
 * - `GET /projects/:projectId` — get a project by ID.
 * - `DELETE /projects/:projectId` — delete a project.
 *
 * @param app - The Fastify application instance.
 */
export async function projectsRoutes(app: FastifyInstance): Promise<void> {
  const auth = { preHandler: requireAuth() };

  app.get<{ Reply: NodeApi.components["schemas"]["Project"][] }>(
    "/projects",
    auth,
    async () => listProjects(app.db),
  );

  app.post<{
    Body: NodeApi.components["schemas"]["CreateProjectRequest"];
    Reply: NodeApi.components["schemas"]["Project"];
  }>("/projects", auth, async (request, reply) => {
    const { name } = request.body;
    if (!name) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "name is required." },
      } as never);
    }
    const project = await createProject(app.db, name);
    return reply.status(201).send(project);
  });

  app.get<{
    Params: { projectId: string };
    Reply: NodeApi.components["schemas"]["Project"];
  }>("/projects/:projectId", auth, async (request) => {
    return getProject(app.db, request.params.projectId);
  });

  app.delete<{ Params: { projectId: string } }>(
    "/projects/:projectId",
    auth,
    async (request, reply) => {
      await removeProject(app.db, request.params.projectId);
      return reply.status(204).send();
    },
  );
}
