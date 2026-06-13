import type { FastifyServerOptions } from "fastify";
import type { AppConfig } from "./config";

/** Fastify-compatible logger option: `false` to disable or a Pino configuration object. */
export type LoggerOption = FastifyServerOptions["logger"];

/**
 * Builds the Fastify/Pino logger option from the current application config.
 *
 * - Returns `false` when logging is disabled (e.g. during tests).
 * - Returns `{ level: 'info' }` in production to minimise output noise.
 * - Returns `{ level: 'debug' }` in all other environments for verbose diagnostics.
 *
 * @param config - The application configuration.
 * @returns A Fastify-compatible logger option.
 */
export function buildLoggerOptions(config: AppConfig): LoggerOption {
  if (!config.logger) return false;
  return { level: config.nodeEnv === "production" ? "info" : "debug" };
}
