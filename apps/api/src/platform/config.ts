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
  /** Secret used to sign JWTs (JWT_SECRET). Must be set in production. */
  jwtSecret: string;
  /**
   * JWT expiry as a time-span string accepted by fast-jwt / ms, e.g. "1h", "30m".
   * Must NOT be a bare number string — "3600" is parsed as 3600 ms (3.6 s) by the
   * ms library. Use "1h" or "3600s" instead. Defaults to "1h".
   */
  jwtTtl: string;
  /**
   * Base64-encoded 32-byte AES-256 key used for envelope encryption of repo tokens
   * (TOKEN_ENC_KEY). Must be set when repos with tokens are used.
   */
  encryptionKey: string;
  /**
   * When true the API returns static mock data instead of querying the database.
   * Intended for demos and local development without a live database.
   * Activate by setting MOCK_MODE=true in the environment.
   */
  mockMode: boolean;
  /** Base URL of the internal Python RAG service (e.g. http://127.0.0.1:8001). */
  ragBaseUrl: string;
  /**
   * Public base URL of this CodeSage instance for webhook callbacks
   * (WEBHOOK_BASE_URL). When unset, webhook registration is skipped.
   */
  webhookBaseUrl: string;
}

/**
 * Normalizes JWT TTL env values to a time-span string understood by `ms` / `@fastify/jwt`.
 * Bare numeric strings are treated as seconds (e.g. `"3600"` → `"3600s"`).
 * @param raw - Raw TTL from configuration or environment.
 * @returns A time-span string such as `"1h"` or `"3600s"`.
 */
export function normalizeJwtTtl(raw: string): string {
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) {
    return `${trimmed}s`;
  }
  return trimmed;
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
    jwtSecret: env.JWT_SECRET ?? "dev-secret-change-me",
    jwtTtl: normalizeJwtTtl(env.AUTH_TOKEN_TTL ?? "1h"),
    encryptionKey: env.TOKEN_ENC_KEY ?? "",
    mockMode: env.MOCK_MODE === "true",
    ragBaseUrl: env.RAG_BASE_URL ?? "http://127.0.0.1:8001",
    webhookBaseUrl: env.WEBHOOK_BASE_URL ?? "",
  };
}
