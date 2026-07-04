import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyBaseLogger } from 'fastify';

const MIGRATIONS_DIR = dirname(fileURLToPath(import.meta.url)) + '/migrations';

/**
 * Mock node:fs so no real filesystem access happens during tests.
 * Each test configures the mocks as needed.
 */
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    default: {
      readdirSync: vi.fn(),
      readFileSync: vi.fn(),
      cpSync: vi.fn(),
      existsSync: actual.existsSync,
    },
    existsSync: actual.existsSync,
    readFileSync: actual.readFileSync,
  };
});

/**
 * Mock import.meta.url resolution so MIGRATIONS_DIR resolves predictably.
 * The actual path doesn't matter because readdirSync / readFileSync are mocked.
 */
vi.mock('node:url', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:url')>();
  return { ...actual };
});

const { default: fs } = await import('node:fs');
const { runMigrations } = await import('./migrate');

/** Creates a minimal logger stub. */
function makeLog(): FastifyBaseLogger {
  return {
    info:  vi.fn(),
    debug: vi.fn(),
    warn:  vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(),
    level: 'info',
    silent: vi.fn(),
  } as unknown as FastifyBaseLogger;
}

/**
 * Creates a sql stub that simulates the two startup calls in runMigrations:
 *   call 0 — CREATE TABLE IF NOT EXISTS schema_migrations  (returns [])
 *   call 1 — SELECT version FROM schema_migrations         (returns appliedVersions rows)
 *   call 2+ — any further direct sql calls                 (returns [])
 * Transactional calls inside sql.begin() are handled by the begin mock separately.
 */
function makeSql(appliedVersions: string[] = []) {
  const begin = vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
    const tx = Object.assign(vi.fn().mockResolvedValue([]), {
      unsafe: vi.fn().mockResolvedValue([]),
    });
    await fn(tx);
  });

  let callIndex = 0;
  const sql = Object.assign(
    vi.fn().mockImplementation(() => {
      const idx = callIndex++;
      if (idx === 1) {
        // Second call: SELECT version FROM schema_migrations
        return Promise.resolve(appliedVersions.map((v) => ({ version: v })));
      }
      return Promise.resolve([]);
    }),
    { begin, end: vi.fn() },
  );
  return sql;
}

describe('runMigrations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates schema_migrations table on first run', async () => {
    vi.mocked(fs.readdirSync).mockReturnValue([] as never);
    const sql = makeSql();
    const log = makeLog();

    await runMigrations(sql as never, log);

    // First sql call is CREATE TABLE IF NOT EXISTS schema_migrations
    expect(sql).toHaveBeenCalled();
  });

  it('applies a pending migration inside a transaction', async () => {
    vi.mocked(fs.readdirSync).mockReturnValue(['20260101_test.sql'] as never);
    vi.mocked(fs.readFileSync).mockReturnValue(
      '-- migrate:up\nCREATE TABLE foo (id uuid PRIMARY KEY);\n-- migrate:down\nDROP TABLE foo;',
    );
    const sql = makeSql([]);
    const log = makeLog();

    await runMigrations(sql as never, log);

    expect(sql.begin).toHaveBeenCalledOnce();
    expect(log.info).toHaveBeenCalledWith({ migration: '20260101_test.sql' }, 'applying migration');
    expect(log.info).toHaveBeenCalledWith({ count: 1 }, 'migrations applied successfully');
  });

  it('skips an already-applied migration', async () => {
    vi.mocked(fs.readdirSync).mockReturnValue(['20260101_test.sql'] as never);
    const sql = makeSql(['20260101_test.sql']);
    const log = makeLog();

    await runMigrations(sql as never, log);

    expect(sql.begin).not.toHaveBeenCalled();
    expect(log.debug).toHaveBeenCalledWith(
      { migration: '20260101_test.sql' },
      'migration already applied, skipping',
    );
  });

  it('ignores files starting with _', async () => {
    vi.mocked(fs.readdirSync).mockReturnValue(['_TEMPLATE.sql', '20260101_test.sql'] as never);
    vi.mocked(fs.readFileSync).mockReturnValue('-- migrate:up\nCREATE TABLE foo (id uuid);\n');
    const sql = makeSql([]);
    const log = makeLog();

    await runMigrations(sql as never, log);

    // Only one migration applied, not the template
    expect(sql.begin).toHaveBeenCalledOnce();
  });

  it('applies files in sorted filename order', async () => {
    vi.mocked(fs.readdirSync).mockReturnValue(
      ['20260102_b.sql', '20260101_a.sql'] as never,
    );
    vi.mocked(fs.readFileSync).mockReturnValue('-- migrate:up\nSELECT 1;\n');
    const order: string[] = [];
    const sql = makeSql([]);
    vi.mocked(sql.begin).mockImplementation(async (fn) => {
      const tx = Object.assign(
        vi.fn().mockImplementation((parts: TemplateStringsArray, ...values: unknown[]) => {
          order.push(String(parts[0]) + values.join(''));
          return Promise.resolve([]);
        }),
        { unsafe: vi.fn().mockResolvedValue([]) },
      );
      await fn(tx);
    });
    const log = makeLog();

    await runMigrations(sql as never, log);

    expect(log.info).toHaveBeenNthCalledWith(
      1, { migration: '20260101_a.sql' }, 'applying migration',
    );
    expect(log.info).toHaveBeenNthCalledWith(
      2, { migration: '20260102_b.sql' }, 'applying migration',
    );
  });

  it('applies a migration file with no dbmate markers as plain SQL', async () => {
    vi.mocked(fs.readdirSync).mockReturnValue(['20260101_plain.sql'] as never);
    vi.mocked(fs.readFileSync).mockReturnValue('CREATE TABLE plain (id uuid PRIMARY KEY);');
    const sql = makeSql([]);
    const log = makeLog();

    await runMigrations(sql as never, log);

    expect(sql.begin).toHaveBeenCalledOnce();
    expect(log.info).toHaveBeenCalledWith({ migration: '20260101_plain.sql' }, 'applying migration');
  });

  it('applies a migrate:up block with no migrate:down section', async () => {
    vi.mocked(fs.readdirSync).mockReturnValue(['20260101_nod.sql'] as never);
    vi.mocked(fs.readFileSync).mockReturnValue('-- migrate:up\nCREATE TABLE nod (id uuid);\n');
    const sql = makeSql([]);
    const log = makeLog();

    await runMigrations(sql as never, log);

    expect(sql.begin).toHaveBeenCalledOnce();
  });

  it('warns and skips a migration with an empty migrate:up block', async () => {
    vi.mocked(fs.readdirSync).mockReturnValue(['20260101_empty.sql'] as never);
    // migrate:up block exists but contains only whitespace — extractUpBlock trims to ''
    vi.mocked(fs.readFileSync).mockReturnValue('-- migrate:up\n\n-- migrate:down\n');
    const sql = makeSql([]);
    const log = makeLog();

    await runMigrations(sql as never, log);

    expect(sql.begin).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledWith(
      { migration: '20260101_empty.sql' },
      'no migrate:up block found, skipping',
    );
    expect(sql.begin).not.toHaveBeenCalled();
  });

  it('logs "all already applied" when nothing is pending', async () => {
    vi.mocked(fs.readdirSync).mockReturnValue(['20260101_test.sql'] as never);
    const sql = makeSql(['20260101_test.sql']);
    const log = makeLog();

    await runMigrations(sql as never, log);

    expect(log.info).toHaveBeenCalledWith('all migrations already applied');
  });

  it('ships idx_jobs_repo_active migration for job supersession lookups', () => {
    const path = join(MIGRATIONS_DIR, '20260704170000_idx_jobs_repo_active.sql');
    const sql = readFileSync(path, 'utf8');
    expect(sql).toContain('idx_jobs_repo_active');
    expect(sql).toContain("payload->>'repoId'");
  });
});
