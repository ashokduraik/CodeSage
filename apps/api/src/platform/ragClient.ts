/**
 * Internal HTTP client for the Python RAG service.
 * Node proxies browser chat requests here; the browser never calls RAG directly.
 */

import type { AppConfig } from "./config";
import type { NodeApi } from "@codesage/shared-types";

type ChatQueryRequest = NodeApi.components["schemas"]["ChatQueryRequest"];

/**
 * Opens a streaming POST to the RAG `/rag/query` endpoint.
 * @param config - Application configuration (includes `ragBaseUrl`).
 * @param body - Validated chat query payload.
 * @returns Fetch `Response` with a readable SSE body stream.
 * @throws {Error} When the RAG service is unreachable or returns a non-OK status.
 */
export async function postRagQueryStream(
  config: AppConfig,
  body: ChatQueryRequest,
): Promise<Response> {
  const url = `${config.ragBaseUrl.replace(/\/$/, "")}/rag/query`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({
      question: body.question,
      projectId: body.projectId,
      audience: body.audience,
      repoIds: body.repoIds,
    }),
  });
  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => "");
    throw new Error(`RAG query failed (${response.status}): ${text || response.statusText}`);
  }
  return response;
}
