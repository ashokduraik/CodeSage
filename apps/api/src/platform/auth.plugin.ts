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
 * Verifies the JWT on the request and sends 401 when missing or invalid.
 * @param request - Incoming Fastify request.
 * @param reply - Fastify reply used to send error responses.
 * @returns `true` when the token is valid; `false` when a 401 was sent.
 */
export async function verifyJwt(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  try {
    await request.jwtVerify();
    return true;
  } catch {
    void reply.status(401).send({
      error: { code: "UNAUTHORIZED", message: "Invalid or missing token." },
    });
    return false;
  }
}

/**
 * Factory that returns a preHandler enforcing RBAC role allowlists.
 * Expects JWT verification to have already run (via {@link registerAuthMiddleware} or {@link requireAuth}).
 *
 * @param allowedRoles - Users whose role is not in this list receive 403 FORBIDDEN.
 * @returns An async Fastify preHandler function.
 */
export function requireRoles(allowedRoles: UserRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const payload = request.user as JwtPayload | undefined;
    if (!payload || !allowedRoles.includes(payload.role)) {
      void reply.status(403).send({
        error: { code: "FORBIDDEN", message: "Insufficient permissions." },
      });
    }
  };
}

/**
 * Factory that returns a Fastify preHandler hook enforcing JWT authentication
 * and, optionally, a set of allowed RBAC roles.
 *
 * Prefer {@link registerAuthMiddleware} for JWT checks on most routes and
 * {@link requireRoles} for per-route RBAC. This factory remains useful for
 * ad-hoc protected routes outside the global middleware scope.
 *
 * @param allowedRoles - When provided, only users whose role appears in this
 *   list may proceed; others receive 403 FORBIDDEN. An empty / absent list
 *   allows any authenticated user.
 * @returns An async Fastify preHandler function.
 */
export function requireAuth(allowedRoles?: UserRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const verified = await verifyJwt(request, reply);
    if (!verified) {
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
