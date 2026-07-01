import type { FastifyInstance } from "fastify";
import type { NodeApi } from "@codesage/shared-types";
import { streamChatQuery } from "./chat.service";

type ChatQueryRequest = NodeApi.components["schemas"]["ChatQueryRequest"];

/**
 * Fastify plugin for developer chat — proxies SSE streams to the Python RAG service.
 *
 * Routes:
 * - `POST /chat/query` — stream grounded answer chunks with citations.
 *
 * @param app - The Fastify application instance.
 */
export async function chatRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: ChatQueryRequest }>("/chat/query", async (request, reply) => {
    const { question, projectId, audience } = request.body;

    if (!question?.trim() || !projectId || !audience) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "question, projectId, and audience are required.",
        },
      } as never);
    }

    await streamChatQuery(app, request.body, reply);
  });
}
