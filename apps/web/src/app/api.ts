import type { NodeApi } from "@codesage/shared-types";

/**
 * Re-export of the generated OpenAPI path map for the Node API.
 * Sourced from `contracts/openapi.node.yaml` via `npm run codegen`.
 * Do not hand-edit — update the contract and regenerate instead.
 */
export type NodePaths = NodeApi.paths;

/** Health response shape, sourced from the generated contract types. */
export type HealthResult = NodeApi.components["schemas"]["HealthResponse"];

/**
 * Fetches the API health endpoint and returns the parsed response.
 * Throws if the HTTP response is not OK.
 * @param baseUrl - Base URL prepended to the `/health` path. Defaults to `/api`.
 * @returns Parsed {@link HealthResult} from the health endpoint.
 * @throws {Error} When the HTTP response status is not 2xx.
 */
export async function getHealth(baseUrl = "/api"): Promise<HealthResult> {
  const res = await fetch(`${baseUrl}/health`);
  if (!res.ok) {
    throw new Error(`health check failed: ${res.status}`);
  }
  return (await res.json()) as HealthResult;
}
