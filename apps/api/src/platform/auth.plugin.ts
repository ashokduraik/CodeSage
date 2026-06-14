import type { FastifyRequest, FastifyReply } from "fastify";

/**
 * RBAC roles that can be attached to a user record.
 * Must mirror the `user_role` Postgres enum and the `UserRole` generated type.
 */
export type UserRole = "admin" | "expert" | "developer" | "end_user";

/**
 * Shape of the decoded JWT payload stored in every signed token.
 * Augments the Fastify request via `request.user` after `request.jwtVerify()`.
 */
export interface JwtPayload {
  /** User UUID (Postgres `users.id`). */
  sub: string;
  /** User's email address. */
  email: string;
  /** RBAC role of the authenticated user. */
  role: UserRole;
}

/**
 * Factory that returns a Fastify preHandler hook enforcing JWT authentication
 * and, optionally, a set of allowed RBAC roles.
 *
 * Usage in a route:
 * ```ts
 * app.get('/users/me', { preHandler: requireAuth() }, handler);
 * app.post('/users', { preHandler: requireAuth(['admin']) }, handler);
 * ```
 *
 * @param allowedRoles - When provided, only users whose role appears in this
 *   list may proceed; others receive 403 FORBIDDEN. An empty / absent list
 *   allows any authenticated user.
 * @returns An async Fastify preHandler function.
 */
export function requireAuth(allowedRoles?: UserRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      await request.jwtVerify();
    } catch {
      void reply.status(401).send({
        error: { code: "UNAUTHORIZED", message: "Invalid or missing token." },
      });
      return;
    }
    if (allowedRoles && allowedRoles.length > 0) {
      const payload = request.user as JwtPayload;
      if (!allowedRoles.includes(payload.role)) {
        void reply.status(403).send({
          error: { code: "FORBIDDEN", message: "Insufficient permissions." },
        });
      }
    }
  };
}
