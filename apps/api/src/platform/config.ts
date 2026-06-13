/**
 * Application runtime configuration read from environment variables.
 * All `process.env` reads are centralised here — no scattered accesses elsewhere.
 */
export interface AppConfig {
  /** Hostname the HTTP server should bind to. */
  host: string;
  /** TCP port the HTTP server listens on. */
  port: number;
  /** Node environment name; drives log level and other env-specific behaviour. */
  nodeEnv: string;
  /** Whether to enable the Fastify/Pino request logger (disabled in tests). */
  logger: boolean;
  /** PostgreSQL connection URL (DATABASE_URL). Required in all non-test environments. */
  databaseUrl: string;
}

/**
 * Builds an {@link AppConfig} by reading environment variables.
 * Returns safe defaults for any variable that is not set.
 * @param env - Environment variable map; defaults to `process.env`.
 * @returns Populated application configuration object.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    host: env.API_HOST ?? "0.0.0.0",
    port: Number(env.API_PORT ?? "3000"),
    nodeEnv: env.NODE_ENV ?? "development",
    logger: env.NODE_ENV !== "test",
    databaseUrl: env.DATABASE_URL ?? "",
  };
}
