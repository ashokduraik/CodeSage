import type { NodeApi } from "@codesage/shared-types";

// Demonstrates that the generated contract types are consumable from the frontend.
// Once contracts/openapi.node.yaml defines paths, these types become non-empty automatically.
export type NodePaths = NodeApi.paths;

export interface HealthResult {
  status: string;
  service: string;
}

export async function getHealth(baseUrl = "/api"): Promise<HealthResult> {
  const res = await fetch(`${baseUrl}/health`);
  if (!res.ok) {
    throw new Error(`health check failed: ${res.status}`);
  }
  return (await res.json()) as HealthResult;
}
