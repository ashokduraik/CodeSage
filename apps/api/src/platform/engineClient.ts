/**
 * Internal HTTP client for the Python engine service.
 * Node proxies browser chat requests here; the browser never calls the engine directly.
 */

import type { AppConfig } from "./config";
import type { EngineApi } from "@codesage/shared-types";

type EngineQueryBody = EngineApi.components["schemas"]["EngineQueryRequest"];

/**
 * Opens a streaming POST to the engine `/engine/query` endpoint.
 * @param config - Application configuration (includes `engineBaseUrl`).
 * @param body - Engine query payload including optional multi-turn history.
 * @param signal - Optional abort signal propagated from client disconnect.
 * @returns Fetch `Response` with a readable SSE body stream.
 * @throws {Error} When the engine service is unreachable or returns a non-OK status.
 */
export async function postEngineQueryStream(
  config: AppConfig,
  body: EngineQueryBody,
  signal?: AbortSignal,
): Promise<Response> {
  const url = `${config.engineBaseUrl.replace(/\/$/, "")}/engine/query`;
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
    throw new Error(`Engine query failed (${response.status}): ${text || response.statusText}`);
  }
  return response;
}
