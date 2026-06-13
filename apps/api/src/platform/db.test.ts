import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Mock postgres before importing the module under test so the factory never
 * attempts a real TCP connection.  The mock returns a lightweight stand-in
 * that satisfies the `Sql` type for assertion purposes.
 */
vi.mock('postgres', () => {
  const mockSql = Object.assign(vi.fn(), { end: vi.fn() });
  const mockPostgres = vi.fn(() => mockSql);
  return { default: mockPostgres };
});

// Import after the mock is registered so the module under test gets the stub.
const { createDbClient } = await import('./db');
const { default: postgres } = await import('postgres');

describe('createDbClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes the connection URL to postgres', () => {
    const url = 'postgresql://user:secret@localhost:5432/codesage';
    createDbClient(url);
    expect(postgres).toHaveBeenCalledWith(url, expect.any(Object));
  });

  it('configures pool options: max, idle_timeout, connect_timeout, onnotice', () => {
    createDbClient('postgresql://localhost/test');
    expect(postgres).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        max: expect.any(Number),
        idle_timeout: expect.any(Number),
        connect_timeout: expect.any(Number),
        onnotice: expect.any(Function),
      }),
    );
  });

  it('onnotice handler does not throw when called', () => {
    createDbClient('postgresql://localhost/test');
    // Extract the onnotice fn from the call arguments and invoke it.
    const opts = vi.mocked(postgres).mock.calls[0]?.[1] as Record<string, unknown> | undefined;
    const onnotice = opts?.['onnotice'] as (() => void) | undefined;
    expect(typeof onnotice).toBe('function');
    expect(() => onnotice?.()).not.toThrow();
  });

  it('returns the Sql instance created by postgres', () => {
    const client = createDbClient('postgresql://localhost/test');
    expect(client).toBeDefined();
    expect(postgres).toHaveBeenCalledOnce();
  });

  it('accepts an empty string without throwing at construction time', () => {
    // Fail-fast happens at query time, not construction; the factory must not throw.
    expect(() => createDbClient('')).not.toThrow();
  });
});
