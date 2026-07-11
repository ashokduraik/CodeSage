import type { FastifyInstance } from "fastify";
import type { NodeApi } from "@codesage/shared-types";
import type { JwtPayload } from "../../platform/auth.plugin";
import {
  createConversation,
  deleteConversation,
  getConversation,
  listConversationMessages,
  listConversations,
  streamChatQuery,
} from "./chat.service";

type ChatSession = NodeApi.components["schemas"]["ChatSession"];
type ChatMessage = NodeApi.components["schemas"]["ChatMessage"];
type ChatQueryRequest = NodeApi.components["schemas"]["ChatQueryRequest"];
type CreateConversationRequest = NodeApi.components["schemas"]["CreateConversationRequest"];

/**
 * Fastify plugin for developer chat — conversation CRUD and SSE query proxy.
 *
 * Routes:
 * - `GET /conversations` — list conversations for the authenticated user.
 * - `POST /conversations` — create a conversation.
 * - `GET /conversations/:conversationId` — get one conversation.
 * - `DELETE /conversations/:conversationId` — soft-delete a conversation.
 * - `GET /conversations/:conversationId/messages` — list messages.
 * - `POST /chat/query` — stream grounded answer chunks with citations.
 *
 * @param app - The Fastify application instance.
 */
export async function chatRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Reply: ChatSession[] }>("/conversations", async (request) => {
    const { sub } = request.user as JwtPayload;
    return listConversations(app.db, sub);
  });

  app.post<{ Body: CreateConversationRequest; Reply: ChatSession }>(
    "/conversations",
    async (request, reply) => {
      const { sub } = request.user as JwtPayload;
      const session = await createConversation(app.db, request.body, sub);
      return reply.status(201).send(session);
    },
  );

  app.get<{ Params: { conversationId: string }; Reply: ChatSession }>(
    "/conversations/:conversationId",
    async (request) => {
      const { sub } = request.user as JwtPayload;
      return getConversation(app.db, request.params.conversationId, sub);
    },
  );

  app.delete<{ Params: { conversationId: string } }>(
    "/conversations/:conversationId",
    async (request, reply) => {
      const { sub } = request.user as JwtPayload;
      await deleteConversation(app.db, request.params.conversationId, sub, sub);
      return reply.status(204).send();
    },
  );

  app.get<{ Params: { conversationId: string }; Reply: ChatMessage[] }>(
    "/conversations/:conversationId/messages",
    async (request) => {
      const { sub } = request.user as JwtPayload;
      return listConversationMessages(app.db, request.params.conversationId, sub);
    },
  );

  app.post<{ Body: ChatQueryRequest }>("/chat/query", async (request, reply) => {
    const { question, conversationId } = request.body;
    if (!question?.trim() || !conversationId) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "conversationId and question are required.",
        },
      } as never);
    }

    await streamChatQuery(app, request, request.body, reply);
  });
}
