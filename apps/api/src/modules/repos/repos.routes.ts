import type { FastifyInstance } from "fastify";
import { listRepos, attachRepo, detachRepo } from "./repos.service";
import type { NodeApi } from "@codesage/shared-types";

/**
 * Fastify plugin that registers repository management routes.
 *
 * JWT authentication is enforced by the global auth middleware in `platform/auth.middleware.ts`.
 *
 * Routes:
 * - `GET /projects/:projectId/repos` — list repos for a project.
 * - `POST /projects/:projectId/repos` — attach a repo + enqueue sync (returns 202).
 * - `DELETE /projects/:projectId/repos/:repoId` — detach a repo.
 *
 * @param app - The Fastify application instance.
 */
export async function reposRoutes(app: FastifyInstance): Promise<void> {
  app.get<{
    Params: { projectId: string };
    Reply: NodeApi.components["schemas"]["Repo"][];
  }>("/projects/:projectId/repos", async (request) => {
    return listRepos(app.db, request.params.projectId);
  });

  app.post<{
    Params: { projectId: string };
    Body: NodeApi.components["schemas"]["CreateRepoRequest"];
    Reply: NodeApi.components["schemas"]["AttachRepoResponse"];
  }>("/projects/:projectId/repos", async (request, reply) => {
    const { projectId } = request.params;
    const { repoUrl, provider, branch, role, token } = request.body;

    if (!repoUrl || !provider || !branch || !role) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "repoUrl, provider, branch, and role are required.",
        },
      } as never);
    }

    const result = await attachRepo(
      app.db,
      projectId,
      repoUrl,
      provider,
      branch,
      role,
      token,
      app.config.encryptionKey,
    );
    return reply.status(202).send(result);
  });

  app.delete<{ Params: { projectId: string; repoId: string } }>(
    "/projects/:projectId/repos/:repoId",
    async (request, reply) => {
      await detachRepo(app.db, request.params.projectId, request.params.repoId);
      return reply.status(204).send();
    },
  );
}
