export interface AppConfig {
  host: string;
  port: number;
  /** Fastify logger on outside of tests. */
  logger: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    host: env.API_HOST ?? "0.0.0.0",
    port: Number(env.API_PORT ?? "3000"),
    logger: env.NODE_ENV !== "test",
  };
}
