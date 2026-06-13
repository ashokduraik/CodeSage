import { describe, it, expect, afterEach, vi } from "vitest";
import type { FastifyInstance } from "fastify";

/**
 * Mock postgres before importing buildApp so no real TCP connection is attempted.
 * The mock end() is a no-op spy, letting us verify the onClose hook calls it.
 */
vi.mock('postgres', () => {
  const mockEnd = vi.fn().mockResolvedValue(undefined);
  const mockSql = Object.assign(vi.fn(), { end: mockEnd });
  return { default: vi.fn(() => mockSql) };
});

const { buildApp } = await import('./app');
const { default: postgres } = await import('postgres');

/**
 * Shared test config: no listening, no logging, no real DB URL needed
 * because the postgres mock never opens a connection.
 */
const TEST_CONFIG = {
  host: '127.0.0.1',
  port: 0,
  nodeEnv: 'test',
  logger: false,
  databaseUrl: 'postgresql://test:test@localhost:5432/test',
} as const;

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
  vi.clearAllMocks();
});

describe('buildApp', () => {
  it('serves GET /health', async () => {
    app = buildApp(TEST_CONFIG);
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', service: 'api' });
  });

  it('builds with the default config without throwing', async () => {
    // NODE_ENV is 'test' under vitest → default config disables the logger.
    app = buildApp();
    await app.ready();
    expect(app.hasRoute({ method: 'GET', url: '/health' })).toBe(true);
  });

  it('decorates the Fastify instance with a db pool', async () => {
    app = buildApp(TEST_CONFIG);
    await app.ready();
    expect(app.db).toBeDefined();
  });

  it('passes databaseUrl to the postgres factory', async () => {
    buildApp(TEST_CONFIG);
    expect(postgres).toHaveBeenCalledWith(TEST_CONFIG.databaseUrl, expect.any(Object));
  });

  it('calls db.end() when the server closes', async () => {
    app = buildApp(TEST_CONFIG);
    await app.ready();
    const endSpy = vi.mocked(app.db.end);
    await app.close();
    app = undefined;
    expect(endSpy).toHaveBeenCalledOnce();
  });
});
