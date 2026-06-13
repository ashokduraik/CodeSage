import postgres from 'postgres';

/**
 * postgres.js `Sql` instance type — the connection pool returned by {@link createDbClient}.
 * Import this type wherever a typed DB handle is needed instead of importing `postgres` directly.
 */
export type Sql = ReturnType<typeof postgres>;

/**
 * Pool options kept intentionally conservative for the Node API layer.
 * Node never does heavy/blocking work, so a small pool is sufficient.
 */
const POOL_OPTIONS = {
  /** Maximum simultaneous connections; enough for auth/CRUD/enqueue traffic. */
  max: 10,
  /** Seconds an idle connection is kept before being released. */
  idle_timeout: 30,
  /** Seconds to wait for a new connection before throwing. */
  connect_timeout: 10,
  /**
   * Suppress PostgreSQL NOTICE messages so they don't pollute structured logs.
   * Warnings and errors still surface through the normal error path.
   */
  onnotice: () => {},
} as const;

/**
 * Creates and returns a postgres.js SQL client (connection pool).
 *
 * Call once at application startup (in `buildApp`) and pass the returned
 * instance to every module that needs database access. Do not create multiple
 * clients for the same process — postgres.js manages the pool internally.
 *
 * @param url - PostgreSQL connection URL, e.g. `DATABASE_URL` from env.
 * @returns A configured `Sql` instance ready for parameterised queries.
 * @throws If `url` is empty or malformed, the first query will throw a
 *   connection error (fail-fast at query time, not at construction time).
 */
export function createDbClient(url: string): Sql {
  return postgres(url, POOL_OPTIONS);
}
