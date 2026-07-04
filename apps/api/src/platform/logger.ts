import type { FastifyInstance, FastifyServerOptions } from "fastify";
import type { AppConfig } from "./config";

/** Fastify-compatible logger option: `false` to disable or a Pino configuration object. */
export type LoggerOption = FastifyServerOptions["logger"];

/**
 * Builds the Fastify/Pino logger option from the current application config.
 *
 * - Returns `false` when logging is disabled (e.g. during tests).
 * - Returns a structured Pino config in all other environments with:
 *   - `level: 'info'` in production, `level: 'debug'` elsewhere.
 *   - Human-readable level labels ("info", "debug", …) instead of numeric codes.
 *   - ISO 8601 timestamps instead of epoch-ms integers.
 *   - `pid` stripped from every log line (hostname is retained).
 *
 * @param config - The application configuration.
 * @returns A Fastify-compatible logger option.
 */
export function buildLoggerOptions(config: AppConfig): LoggerOption {
  if (!config.logger) return false;

  const level = config.nodeEnv === "production" ? "info" : "debug";

  return {
    level,
    formatters: {
      /** Emit the level name ("info") instead of the numeric Pino severity code (30). */
      level: (label: string) => ({ level: label }),
      /** Remove pid; keep hostname so logs are still traceable across machines. */
      bindings: (bindings: Record<string, unknown>) => ({
        hostname: bindings["hostname"],
      }),
    },
    /** Emit ISO 8601 wall-clock time instead of epoch milliseconds. */
    timestamp: () => `,"time":"${new Date().toISOString()}"`,
  };
}

/**
 * Registers per-request access logs at `debug` (Fastify defaults to `info`).
 *
 * @param app - Fastify instance with logging enabled.
 */
export function registerRequestLogging(app: FastifyInstance): void {
  app.addHook("onRequest", (request, _reply, done) => {
    request.log.debug({ req: request }, "incoming request");
    done();
  });

  app.addHook("onResponse", (request, reply, done) => {
    request.log.debug(
      { res: reply, responseTime: reply.elapsedTime },
      "request completed",
    );
    done();
  });
}
