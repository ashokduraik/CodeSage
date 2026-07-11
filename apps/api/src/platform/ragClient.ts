/**
 * Internal HTTP client for the Python RAG service.
 * Node proxies browser chat requests here; the browser never calls RAG directly.
 */

import type { AppConfig } from "./config";
import type { RagApi } from "@codesage/shared-types";

type RagQueryBody = RagApi.components["schemas"]["RagQueryRequest"];

/**
 * Opens a streaming POST to the RAG `/rag/query` endpoint.
 * @param config - Application configuration (includes `ragBaseUrl`).
 * @param body - RAG query payload including optional multi-turn history.
 * @param signal - Optional abort signal propagated from client disconnect.
 * @returns Fetch `Response` with a readable SSE body stream.
 * @throws {Error} When the RAG service is unreachable or returns a non-OK status.
 */
export async function postRagQueryStream(
  config: AppConfig,
  body: RagQueryBody,
  signal?: AbortSignal,
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
      generateTitle: body.generateTitle,
      history: body.history,
      pageContext: body.pageContext,
    }),
    signal,
  });
  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => "");
    throw new Error(`RAG query failed (${response.status}): ${text || response.statusText}`);
  }
  return response;
}
