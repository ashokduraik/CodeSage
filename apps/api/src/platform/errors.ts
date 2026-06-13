import type { FastifyError, FastifyInstance } from "fastify";

/**
 * Standard API error response body returned for every HTTP error.
 * Provides a predictable shape that clients can safely deserialise.
 */
export interface ApiErrorBody {
  error: {
    /** Machine-readable error code (e.g. `VALIDATION_ERROR`, `NOT_FOUND`). */
    code: string;
    /** Human-readable error description. */
    message: string;
    /** Optional structured detail payload (e.g. field-level validation errors). */
    details?: unknown;
  };
}

/**
 * Domain error class for intentional API errors.
 * Throw this in route handlers instead of a plain `Error` when the failure
 * should map to a specific HTTP status code and machine-readable code.
 */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  /**
   * @param statusCode - HTTP status code to include in the response.
   * @param code - Machine-readable error code (e.g. `VALIDATION_ERROR`).
   * @param message - Human-readable error description.
   * @param details - Optional extra context (e.g. field-level validation details).
   */
  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

/**
 * Registers a global error handler and a 404 handler on the Fastify instance.
 * Every error is mapped to {@link ApiErrorBody} so clients always receive a
 * consistent response shape regardless of the error source.
 * - 5xx errors are logged at `error` level; 4xx errors at `warn` level.
 * @param app - The Fastify application instance to register handlers on.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setNotFoundHandler((_request, reply) => {
    return reply.status(404).send({
      error: { code: "NOT_FOUND", message: "Route not found" },
    } satisfies ApiErrorBody);
  });

  app.setErrorHandler((error: FastifyError, _request, reply) => {
    const statusCode = error.statusCode ?? 500;
    const isApiError = error instanceof ApiError;
    const code = isApiError
      ? error.code
      : statusCode >= 500
        ? "INTERNAL_ERROR"
        : "REQUEST_ERROR";
    const details = isApiError ? error.details : undefined;

    if (statusCode >= 500) {
      app.log.error({ err: error }, "unhandled server error");
    } else {
      app.log.warn({ err: error }, "request error");
    }

    return reply.status(statusCode).send({
      error: { code, message: error.message, details },
    } satisfies ApiErrorBody);
  });
}
