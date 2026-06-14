import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../platform/auth.plugin";
import type { JwtPayload } from "../../platform/auth.plugin";
import { getUserById, createNewUser } from "./users.service";
import type { NodeApi } from "@codesage/shared-types";

/**
 * Fastify plugin that registers user management routes.
 *
 * Routes:
 * - `GET /users/me` — returns the authenticated user's profile.
 * - `POST /users` — creates a new user (admin role required).
 *
 * @param app - The Fastify application instance.
 */
export async function usersRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Reply: NodeApi.components["schemas"]["User"] }>(
    "/users/me",
    { preHandler: requireAuth() },
    async (request) => {
      const { sub } = request.user as JwtPayload;
      return getUserById(app.db, sub);
    },
  );

  app.post<{
    Body: NodeApi.components["schemas"]["CreateUserRequest"];
    Reply: NodeApi.components["schemas"]["User"];
  }>("/users", { preHandler: requireAuth(["admin"]) }, async (request, reply) => {
    const { email, password, role } = request.body;

    if (!email || !password || !role) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "email, password, and role are required." },
      } as never);
    }

    const user = await createNewUser(app.db, email, password, role);
    return reply.status(201).send(user);
  });
}
