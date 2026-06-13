import type { FastifyInstance } from "fastify";

export interface HealthResponse {
  status: "ok";
  service: "api";
}

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async (): Promise<HealthResponse> => {
    return { status: "ok", service: "api" };
  });
}
