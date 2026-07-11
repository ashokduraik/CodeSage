import type { FastifyInstance, FastifyReply } from "fastify";
import type { NodeApi } from "@codesage/shared-types";
import { postRagQueryStream } from "../../platform/ragClient";
import { ApiError } from "../../platform/errors";

type ChatQueryRequest = NodeApi.components["schemas"]["ChatQueryRequest"];

/**
 * Proxies a chat query to the Python RAG service and pipes the SSE stream to the client.
 * @param app - Fastify instance (provides config).
 * @param body - Validated chat query request.
 * @param reply - Fastify reply to write the stream into.
 */
export async function streamChatQuery(
  app: FastifyInstance,
  body: ChatQueryRequest,
  reply: FastifyReply,
): Promise<void> {
  let ragResponse: Response;
  try {
    ragResponse = await postRagQueryStream(app.config, body);
  } catch (err) {
    const message = err instanceof Error ? err.message : "RAG service unavailable";
    throw new ApiError(502, "RAG_UNAVAILABLE", message);
  }

  // Writing to reply.raw bypasses Fastify's reply pipeline, so headers buffered by
  // plugins (notably @fastify/cors' Access-Control-* / Vary) are never flushed. Copy
  // them onto the raw response, otherwise the browser blocks the SSE stream cross-origin
  // even though every non-streaming route works.
  const forwardedHeaders: Record<string, string> = {};
  for (const [name, value] of Object.entries(reply.getHeaders())) {
    const lower = name.toLowerCase();
    if (value !== undefined && (lower.startsWith("access-control-") || lower === "vary")) {
      forwardedHeaders[name] = String(value);
    }
  }

  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    ...forwardedHeaders,
  });

  const reader = ragResponse.body!.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      reply.raw.write(value);
    }
  } finally {
    reply.raw.end();
  }
}
