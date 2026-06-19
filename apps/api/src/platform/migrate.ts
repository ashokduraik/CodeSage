import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyBaseLogger } from 'fastify';
import type { Sql } from './db.js';

/**
 * Absolute path to the migrations folder, resolved relative to this file.
 * Works in both dev (src/) and prod (dist/) as long as SQL files are copied
 * to dist/ by the build step (see tsup.config.ts onSuccess).
 */
const MIGRATIONS_DIR = path.resolve(fileURLToPath(import.meta.url), '..', 'migrations');

/**
 * Extracts the `-- migrate:up` block from a dbmate-style SQL file.
 * Files that do not contain the marker are returned as-is (treated as plain SQL).
 *
 * @param content - Full file content.
 * @returns The SQL to execute on the up migration.
 */
function extractUpBlock(content: string): string {
  const UP = '-- migrate:up';
  const DOWN = '-- migrate:down';
  const upIndex = content.indexOf(UP);
  if (upIndex === -1) return content;
  const bodyStart = upIndex + UP.length;
  const downIndex = content.indexOf(DOWN, bodyStart);
  return downIndex === -1 ? content.slice(bodyStart) : content.slice(bodyStart, downIndex);
}

/**
 * Runs all pending database migrations at application startup.
 *
 * - Creates the `schema_migrations` tracking table if it does not exist.
 * - Reads every `*.sql` file in the migrations directory (sorted by filename,
 *   excluding files whose name starts with `_`).
 * - Skips files that have already been recorded in `schema_migrations`.
 * - Applies each pending migration and records it atomically in a transaction.
 * - Throws (and aborts startup) if any migration fails.
 *
 * @param sql - Active postgres.js connection pool.
 * @param log - Fastify logger for structured output.
 * @throws If a migration query fails or the migrations directory cannot be read.
 */
export async function runMigrations(sql: Sql, log: FastifyBaseLogger): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    text        PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  const applied = new Set<string>(
    (await sql<{ version: string }[]>`SELECT version FROM schema_migrations`).map(
      (r) => r.version,
    ),
  );

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql') && !f.startsWith('_'))
    .sort();

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) {
      log.debug({ migration: file }, 'migration already applied, skipping');
      continue;
    }

    const content = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const upSql = extractUpBlock(content).trim();

    if (!upSql) {
      log.warn({ migration: file }, 'no migrate:up block found, skipping');
      continue;
    }

    log.info({ migration: file }, 'applying migration');
    await sql.begin(async (tx) => {
      await tx.unsafe(upSql);
      await tx`INSERT INTO schema_migrations (version) VALUES (${file})`;
    });
    count++;
  }

  if (count === 0) {
    log.info('all migrations already applied');
  } else {
    log.info({ count }, 'migrations applied successfully');
  }
}
