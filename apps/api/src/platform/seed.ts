import bcrypt from 'bcryptjs';
import type { FastifyBaseLogger } from 'fastify';
import type { Sql } from './db.js';

const SALT_ROUNDS = 10;

/**
 * Dev seed users inserted on every non-production startup.
 * Passwords are hashed at runtime — no plaintext secrets land in source.
 */
const SEED_USERS: Array<{ email: string; password: string; role: string }> = [
  { email: 'admin@codesage.dev',  password: 'admin123',  role: 'admin'     },
  { email: 'expert@codesage.dev', password: 'expert123', role: 'expert'    },
  { email: 'dev@codesage.dev',    password: 'dev123',    role: 'developer' },
];

const SEED_PROJECT = 'Demo Project';

/**
 * Seeds the database with a minimal usable dev state on every non-production startup.
 *
 * - No-op in production (`NODE_ENV === 'production'`).
 * - Idempotent: all inserts use `ON CONFLICT DO NOTHING`, so re-running is safe.
 * - Creates three dev users (admin / expert / developer) and one demo project.
 *
 * @param sql - Active postgres.js connection pool.
 * @param log - Fastify logger for structured output.
 */
export async function runSeed(sql: Sql, log: FastifyBaseLogger): Promise<void> {
  if (process.env['NODE_ENV'] === 'production') {
    return;
  }

  for (const user of SEED_USERS) {
    const hash = await bcrypt.hash(user.password, SALT_ROUNDS);
    const rows = await sql<{ id: string }[]>`
      INSERT INTO users (email, password_hash, role)
      VALUES (${user.email}, ${hash}, ${user.role}::user_role)
      ON CONFLICT (email) DO NOTHING
      RETURNING id
    `;
    if (rows.length > 0) {
      log.info({ email: user.email, role: user.role }, 'seed: user created');
    } else {
      log.debug({ email: user.email }, 'seed: user already exists');
    }
  }

  const rows = await sql<{ id: string }[]>`
    INSERT INTO projects (name, status)
    VALUES (${SEED_PROJECT}, 'active')
    ON CONFLICT DO NOTHING
    RETURNING id
  `;
  if (rows.length > 0) {
    log.info({ project: SEED_PROJECT, id: rows[0]?.id }, 'seed: project created');
  } else {
    log.debug({ project: SEED_PROJECT }, 'seed: project already exists');
  }
}
