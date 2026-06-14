import type { FastifyInstance } from "fastify";
import { loginUser } from "./auth.service";
import type { NodeApi } from "@codesage/shared-types";

/**
 * Fastify plugin that registers authentication routes.
 *
 * Routes:
 * - `POST /auth/login` — validates email + password and returns a signed JWT.
 *
 * @param app - The Fastify application instance.
 */
export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post<{
    Body: NodeApi.components["schemas"]["LoginRequest"];
    Reply: NodeApi.components["schemas"]["LoginResponse"];
  }>("/auth/login", async (request, reply) => {
    const { email, password } = request.body;

    if (!email || !password) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "email and password are required." },
      } as never);
    }

    const result = await loginUser(app.db, app, email, password);
    return reply.status(200).send(result);
  });
}
