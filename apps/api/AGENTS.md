# AGENTS.md — apps/api

Local rules for the Node API. Root [`/AGENTS.md`](../../AGENTS.md) also applies.

## The golden rule

**Node never blocks on heavy work.** If a handler would parse, embed, build a graph, distill, or
run retrieval, that is wrong — **enqueue a job** (Postgres queue) or **proxy to `apps/engine`**
instead. Heavy/blocking work is Python's job.

## Do

- Keep **module-per-domain**: `routes + service + repository + tests` per module, public surface
  only, no cross-imports of another module's internals.
- Put cross-cutting concerns in `platform/` (db, queue, config, logging, errors, migrate, seed).
- Use **generated types** from `contracts/` (via `packages/shared-types`) for all requests,
  responses, and job payloads. Validate inputs at the edge.
- **Encrypt repo tokens at rest**; enforce **RBAC**; **audit-log** sensitive actions.
- Small files, descriptive names, colocated `*.test.ts`.

## Auto-migrate & auto-seed on startup

The API runs migrations and seeds the database automatically on every boot (`src/index.ts`):

```
registerProcessHandlers() → loadConfig() → buildApp() → runMigrations() → runSeed() [non-prod only] → app.listen()
```

Startup also registers `unhandledRejection` / `uncaughtException` safety nets
(`platform/processHandlers.ts`) so stray promise rejections (e.g. undici abort after SSE)
do not take down the process. Route errors go through Fastify `setErrorHandler`
(`platform/errors.ts`). Streaming chat failures emit an SSE `error` chunk — see
`.cursor/rules/error-handling.mdc`.

- **`runMigrations`** (`platform/migrate.ts`) applies every unapplied `*.sql` file in
  `platform/migrations/` (sorted by filename). Startup aborts if any migration fails.
- **`runSeed`** (`platform/seed.ts`) inserts dev users and a demo project using
  `ON CONFLICT DO NOTHING` — safe to re-run, skipped in production.

### Adding a schema change

1. Copy `src/platform/migrations/_TEMPLATE.sql` → `YYYYMMDDHHMMSS_describe_change.sql`.
2. Fill `-- migrate:up` (and `-- migrate:down`).
3. Update `docs/data-model.md` and `docs/schema/<table>.md` in the same PR.
4. Restart the API — migration applies automatically.

Never edit an already-applied migration file; add a new one.

## Don't

- Don't implement business logic that belongs in `apps/engine/src/services/`.
- Don't hand-write API/job shapes — edit `contracts/` and run codegen.
- Don't call the database with ad-hoc queries scattered across modules — go through the module's
  repository layer.
- Don't commit secrets.

## Before finishing

No blocking work in handlers; shapes generated; security in place; tests + lint clean; update
`TODO.md`/`README.md`. See `docs/development-workflow.md` §7.
