import type { FastifyInstance, FastifyRequest } from "fastify";

/** Public route definition: HTTP method + path (with optional `/api` prefix). */
interface PublicRoute {
  method: string;
  paths: readonly string[];
}

/**
 * Routes that bypass JWT verification.
 * Paths are listed both with and without the `/api` prefix for dev-proxy flexibility.
 */
const PUBLIC_ROUTES: readonly PublicRoute[] = [
  { method: "GET", paths: ["/api/health"] },
  { method: "POST", paths: ["/api/auth/login"] },
];

/**
 * Returns whether the request targets a public (unauthenticated) route.
 * @param request - Incoming Fastify request.
 */
export function isPublicRoute(request: FastifyRequest): boolean {
  const qIndex = request.url.indexOf("?");
  const pathname = qIndex === -1 ? request.url : request.url.slice(0, qIndex);
  const method = request.method.toUpperCase();

  return PUBLIC_ROUTES.some(
    (route) => route.method === method && route.paths.includes(pathname),
  );
}

/**
 * Registers a global `onRequest` hook that verifies JWTs for all routes except {@link PUBLIC_ROUTES}.
 * Must be registered after `@fastify/jwt` and before domain route plugins.
 * @param app - Fastify instance (typically the `/api` scoped plugin).
 */
export function registerAuthMiddleware(app: FastifyInstance): void {
  app.addHook("onRequest", async (request, reply) => {
    if (isPublicRoute(request)) {
      return;
    }

    try {
      await request.jwtVerify();
    } catch (error) {
      void reply.status(401).send({
        error: { code: "UNAUTHORIZED", message: error instanceof Error ? error.message : "Invalid or missing token." },
      });
    }
  });
}
