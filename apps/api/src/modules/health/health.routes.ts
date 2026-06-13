import type { FastifyInstance } from "fastify";
import type { NodeApi } from "@codesage/shared-types";

/**
 * Fastify plugin that registers the `/health` liveness route.
 * The response type is sourced from `contracts/openapi.node.yaml` via codegen —
 * do not hand-edit the type; update the contract and run `npm run codegen` instead.
 * @param app - The Fastify application instance to register the route on.
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async (): Promise<NodeApi.components["schemas"]["HealthResponse"]> => {
    return { status: "ok", service: "api" };
  });
}
