import type { FastifyInstance } from "fastify";
import { listRepos, attachRepo, detachRepo, probeRepoUrl, syncRepo } from "./repos.service";
import { appendAuditLog, AUDIT_ACTIONS } from "../../platform/audit";
import type { JwtPayload } from "../../platform/auth.plugin";
import type { NodeApi } from "@codesage/shared-types";

/**
 * Fastify plugin that registers repository management routes.
 *
 * JWT authentication is enforced by the global auth middleware in `platform/auth.middleware.ts`.
 *
 * Routes:
 * - `POST /repos/probe` — probe URL before attach.
 * - `GET /projects/:projectId/repos` — list repos for a project.
 * - `POST /projects/:projectId/repos` — attach a repo + enqueue sync (returns 202).
 * - `DELETE /projects/:projectId/repos/:repoId` — soft-detach a repo.
 * - `POST /projects/:projectId/repos/:repoId/sync` — enqueue manual sync (returns 202).
 *
 * @param app - The Fastify application instance.
 */
export async function reposRoutes(app: FastifyInstance): Promise<void> {
  app.post<{
    Body: NodeApi.components["schemas"]["ProbeRepoRequest"];
    Reply: NodeApi.components["schemas"]["ProbeRepoResponse"];
  }>("/repos/probe", async (request, reply) => {
    const { repoUrl, token } = request.body;
    if (!repoUrl?.trim()) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "repoUrl is required." },
      } as never);
    }
    return probeRepoUrl(repoUrl.trim(), token);
  });

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
    const body = request.body;

    if (!body.repoUrl?.trim() || !body.branch?.trim()) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "repoUrl and branch are required.",
        },
      } as never);
    }

    const result = await attachRepo(
      app.db,
      projectId,
      body,
      app.config.encryptionKey,
      app.config.webhookBaseUrl,
    );
    const { sub } = request.user as JwtPayload;
    await appendAuditLog(app.db, sub, AUDIT_ACTIONS.REPO_ATTACH, result.repo.id);
    return reply.status(202).send(result);
  });

  app.delete<{ Params: { projectId: string; repoId: string } }>(
    "/projects/:projectId/repos/:repoId",
    async (request, reply) => {
      const { projectId, repoId } = request.params;
      await detachRepo(app.db, projectId, repoId, app.config.encryptionKey);
      const { sub } = request.user as JwtPayload;
      await appendAuditLog(app.db, sub, AUDIT_ACTIONS.REPO_DETACH, repoId);
      return reply.status(204).send();
    },
  );

  app.post<{
    Params: { projectId: string; repoId: string };
    Reply: NodeApi.components["schemas"]["SyncRepoResponse"];
  }>("/projects/:projectId/repos/:repoId/sync", async (request, reply) => {
    const { projectId, repoId } = request.params;
    const result = await syncRepo(app.db, projectId, repoId);
    const { sub } = request.user as JwtPayload;
    await appendAuditLog(app.db, sub, AUDIT_ACTIONS.REPO_SYNC, repoId);
    return reply.status(202).send(result);
  });
}
