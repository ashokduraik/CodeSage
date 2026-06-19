import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FastifyBaseLogger } from 'fastify';

vi.mock('bcryptjs', () => ({
  default: { hash: vi.fn().mockResolvedValue('$hashed') },
}));

const { runSeed } = await import('./seed');

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
 * Creates a sql stub that returns the given rows for every tagged-template call.
 * Pass `{ users: [...], project: [...] }` to control per-call responses.
 */
function makeSql(responses: Array<{ id: string }[]> = []) {
  let callIndex = 0;
  return vi.fn().mockImplementation(() => {
    const rows = responses[callIndex] ?? [];
    callIndex++;
    return Promise.resolve(rows);
  }) as never;
}

describe('runSeed', () => {
  const originalEnv = process.env['NODE_ENV'];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env['NODE_ENV'] = originalEnv;
  });

  it('does nothing in production', async () => {
    process.env['NODE_ENV'] = 'production';
    const sql = makeSql();
    const log = makeLog();

    await runSeed(sql, log);

    expect(sql).not.toHaveBeenCalled();
  });

  it('inserts users and project when they do not exist', async () => {
    process.env['NODE_ENV'] = 'development';
    // 3 users + 1 project, all returning a new id row
    const newRow = [{ id: 'uuid-1' }];
    const sql = makeSql([newRow, newRow, newRow, newRow]);
    const log = makeLog();

    await runSeed(sql, log);

    expect(sql).toHaveBeenCalledTimes(4);
    // Each new user is logged at info level
    expect(vi.mocked(log.info)).toHaveBeenCalledTimes(4); // 3 users + 1 project
  });

  it('logs at debug level when rows already exist', async () => {
    process.env['NODE_ENV'] = 'development';
    // All queries return empty (ON CONFLICT DO NOTHING — row already exists)
    const sql = makeSql([[], [], [], []]);
    const log = makeLog();

    await runSeed(sql, log);

    expect(vi.mocked(log.debug)).toHaveBeenCalledTimes(4);
    expect(vi.mocked(log.info)).not.toHaveBeenCalled();
  });

  it('hashes passwords with bcryptjs before inserting', async () => {
    process.env['NODE_ENV'] = 'development';
    const { default: bcrypt } = await import('bcryptjs');
    const sql = makeSql([[], [], [], []]);
    const log = makeLog();

    await runSeed(sql, log);

    expect(bcrypt.hash).toHaveBeenCalledTimes(3);
    // Each hash call uses a salt round value
    expect(vi.mocked(bcrypt.hash).mock.calls[0]?.[1]).toBeGreaterThan(0);
  });

  it('runs in test environment (NODE_ENV=test)', async () => {
    process.env['NODE_ENV'] = 'test';
    const sql = makeSql([[], [], [], []]);
    const log = makeLog();

    await runSeed(sql, log);

    expect(sql).toHaveBeenCalledTimes(4);
  });
});
