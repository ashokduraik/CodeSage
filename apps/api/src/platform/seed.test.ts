import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FastifyBaseLogger } from 'fastify';

vi.mock('bcryptjs', () => ({
  default: { hash: vi.fn().mockResolvedValue('$hashed') },
}));

const { runSeed } = await import('./seed');

/** Creates a minimal logger stub. */
function makeLog(): FastifyBaseLogger {
  return {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
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

  it('inserts users when they do not exist', async () => {
    process.env['NODE_ENV'] = 'development';
    const empty: { id: string }[] = [];
    const newRow = [{ id: 'uuid-1' }];
    const sql = makeSql([empty, newRow, empty, newRow, empty, newRow]);
    const log = makeLog();

    await runSeed(sql, log);

    expect(sql).toHaveBeenCalledTimes(6);
    expect(vi.mocked(log.info)).toHaveBeenCalledTimes(3);
  });

  it('skips insert when users already exist', async () => {
    process.env['NODE_ENV'] = 'development';
    const existing = [{ id: 'uuid-existing' }];
    const sql = makeSql([existing, existing, existing]);
    const log = makeLog();

    await runSeed(sql, log);

    expect(sql).toHaveBeenCalledTimes(3);
    expect(vi.mocked(log.debug)).toHaveBeenCalledTimes(3);
    expect(vi.mocked(log.info)).not.toHaveBeenCalled();
  });

  it('hashes passwords only when creating new users', async () => {
    process.env['NODE_ENV'] = 'development';
    const { default: bcrypt } = await import('bcryptjs');
    const empty: { id: string }[] = [];
    const newRow = [{ id: 'uuid-1' }];
    const sql = makeSql([empty, newRow, empty, newRow, empty, newRow]);
    const log = makeLog();

    await runSeed(sql, log);

    expect(bcrypt.hash).toHaveBeenCalledTimes(3);
    expect(vi.mocked(bcrypt.hash).mock.calls[0]?.[1]).toBeGreaterThan(0);
  });

  it('does not hash passwords when users already exist', async () => {
    process.env['NODE_ENV'] = 'development';
    const { default: bcrypt } = await import('bcryptjs');
    const existing = [{ id: 'uuid-existing' }];
    const sql = makeSql([existing, existing, existing]);
    const log = makeLog();

    await runSeed(sql, log);

    expect(bcrypt.hash).not.toHaveBeenCalled();
  });

  it('runs in test environment (NODE_ENV=test)', async () => {
    process.env['NODE_ENV'] = 'test';
    const existing = [{ id: 'uuid-1' }];
    const sql = makeSql([existing, existing, existing]);
    const log = makeLog();

    await runSeed(sql, log);

    expect(sql).toHaveBeenCalledTimes(3);
  });
});
