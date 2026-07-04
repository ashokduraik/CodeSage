import type { FastifyInstance } from "fastify";
import { requireRoles } from "../../platform/auth.plugin";
import type { JwtPayload } from "../../platform/auth.plugin";
import { appendAuditLog, AUDIT_ACTIONS } from "../../platform/audit";
import { getUserById, createNewUser, changeUserRole } from "./users.service";
import type { NodeApi } from "@codesage/shared-types";

/**
 * Fastify plugin that registers user management routes.
 *
 * JWT authentication is enforced by the global auth middleware in `platform/auth.middleware.ts`.
 *
 * Routes:
 * - `GET /users/me` — returns the authenticated user's profile.
 * - `POST /users` — creates a new user (admin role required).
 * - `PATCH /users/:userId` — updates a user's RBAC role (admin role required).
 *
 * @param app - The Fastify application instance.
 */
export async function usersRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Reply: NodeApi.components["schemas"]["User"] }>("/users/me", async (request) => {
    const { sub } = request.user as JwtPayload;
    return getUserById(app.db, sub);
  });

  app.post<{
    Body: NodeApi.components["schemas"]["CreateUserRequest"];
    Reply: NodeApi.components["schemas"]["User"];
  }>("/users", { preHandler: requireRoles(["admin"]) }, async (request, reply) => {
    const { email, password, role } = request.body;
    const { sub } = request.user as JwtPayload;

    if (!email || !password || !role) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "email, password, and role are required." },
      } as never);
    }

    const user = await createNewUser(app.db, email, password, role, sub);
    await appendAuditLog(app.db, sub, AUDIT_ACTIONS.USER_CREATE, user.id);
    return reply.status(201).send(user);
  });

  app.patch<{
    Params: { userId: string };
    Body: NodeApi.components["schemas"]["UpdateUserRoleRequest"];
    Reply: NodeApi.components["schemas"]["User"];
  }>("/users/:userId", { preHandler: requireRoles(["admin"]) }, async (request, reply) => {
    const { role } = request.body;
    const { sub } = request.user as JwtPayload;

    if (!role) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "role is required." },
      } as never);
    }

    const user = await changeUserRole(app.db, request.params.userId, role, sub);
    await appendAuditLog(
      app.db,
      sub,
      AUDIT_ACTIONS.USER_ROLE_CHANGE,
      `${request.params.userId}:${role}`,
    );
    return reply.send(user);
  });
}
