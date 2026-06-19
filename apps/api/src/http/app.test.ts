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
  jwtSecret: 'test-secret-32-chars-long-enough!',
  jwtTtl: '3600',
  encryptionKey: '',
  mockMode: false,
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
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', service: 'api' });
  });

  it('builds with the default config without throwing', async () => {
    // NODE_ENV is 'test' under vitest → default config disables the logger.
    app = buildApp();
    await app.ready();
    expect(app.hasRoute({ method: 'GET', url: '/api/health' })).toBe(true);
  });

  it('decorates the Fastify instance with a db pool', async () => {
    app = buildApp(TEST_CONFIG);
    await app.ready();
    expect(app.db).toBeDefined();
  });

  it('decorates the Fastify instance with the resolved config', async () => {
    app = buildApp(TEST_CONFIG);
    await app.ready();
    expect(app.config).toMatchObject({ jwtSecret: 'test-secret-32-chars-long-enough!' });
  });

  it('normalizes bare numeric jwtTtl to seconds when building the app', async () => {
    app = buildApp({ ...TEST_CONFIG, jwtTtl: '3600' });
    await app.ready();
    expect(app.config.jwtTtl).toBe('3600s');
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

  it('adds CORS headers in non-production environments', async () => {
    app = buildApp({ ...TEST_CONFIG, nodeEnv: 'development' });
    await app.ready();
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/api/health',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'GET',
      },
    });
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('does not register CORS in production', async () => {
    app = buildApp({ ...TEST_CONFIG, nodeEnv: 'production' });
    await app.ready();
    const res = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { origin: 'http://evil.example.com' },
    });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
