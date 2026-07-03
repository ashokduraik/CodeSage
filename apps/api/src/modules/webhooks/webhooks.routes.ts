import type { FastifyInstance, FastifyRequest } from "fastify";
import { ApiError } from "../../platform/errors";
import { handlePushWebhook } from "./webhooks.service";
import type { NodeApi } from "@codesage/shared-types";

type RepoProvider = NodeApi.components["schemas"]["RepoProvider"];

/** Fastify request augmented with raw body bytes for HMAC verification. */
interface WebhookRequest extends FastifyRequest {
  rawBody?: Buffer;
}

const VALID_PROVIDERS: readonly RepoProvider[] = ["github", "gitlab"];

/**
 * Fastify plugin for inbound Git provider webhooks.
 *
 * Routes:
 * - `POST /webhooks/:provider` — verify signature and enqueue sync job.
 *
 * @param app - Fastify instance scoped under `/api`.
 */
export async function webhooksRoutes(app: FastifyInstance): Promise<void> {
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (request, body, done) => {
      (request as WebhookRequest).rawBody = body as Buffer;
      try {
        done(null, JSON.parse((body as Buffer).toString("utf8")));
      } catch (error) {
        done(error as Error, undefined);
      }
    },
  );

  app.post<{ Params: { provider: string } }>(
    "/webhooks/:provider",
    async (request, reply) => {
      const provider = request.params.provider as RepoProvider;
      if (!VALID_PROVIDERS.includes(provider)) {
        return reply.status(404).send({
          error: { code: "NOT_FOUND", message: "Unknown webhook provider." },
        });
      }

      const rawBody = (request as WebhookRequest).rawBody;
      if (!rawBody) {
        return reply.status(400).send({
          error: { code: "VALIDATION_ERROR", message: "Missing request body." },
        });
      }

      try {
        await handlePushWebhook(
          app.db,
          provider,
          rawBody,
          request.body,
          request.headers,
          app.config.encryptionKey,
        );
      } catch (error) {
        if (error instanceof ApiError) {
          return reply.status(error.statusCode).send({
            error: { code: error.code, message: error.message },
          });
        }
        throw error;
      }

      return reply.status(204).send();
    },
  );
}
