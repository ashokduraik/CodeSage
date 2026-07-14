import 'dotenv/config';
import { buildApp } from './http/app.js';
import { loadConfig } from './platform/config.js';
import { runMigrations } from './platform/migrate.js';
import { runSeed } from './platform/seed.js';
import { assertServiceUsersExist } from './platform/serviceUsers.js';
import { registerProcessHandlers } from './platform/processHandlers.js';

/**
 * Application entry point.
 *
 * Startup sequence (order matters):
 *   1. Register process-level rejection/exception safety nets.
 *   2. Build the Fastify app (creates DB pool, registers plugins).
 *   3. Run pending migrations — aborts startup on failure so no request
 *      can arrive against a stale or broken schema.
 *   4. Seed dev data (non-production only, idempotent).
 *   5. Start listening for HTTP requests.
 */
async function start(): Promise<void> {
  registerProcessHandlers({
    logError: (message, context) => {
      console.error(JSON.stringify({ level: "error", msg: message, ...context }));
    },
  });

  const config = loadConfig();
  const app = buildApp(config);

  await runMigrations(app.db, app.log);
  await assertServiceUsersExist(app.db);
  await runSeed(app.db, app.log);

  await app.listen({ host: config.host, port: config.port });
}

start().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
