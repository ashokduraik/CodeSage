# db/ — Database schema reference

PostgreSQL (+pgvector) is the **single datastore** (ADR 0003).

> **Migration files have moved.**
> SQL migration files now live in `apps/api/src/platform/migrations/` and are
> applied automatically at API startup — no separate migration command is needed.

## Where things live

| Path | Purpose |
|---|---|
| `apps/api/src/platform/migrations/` | Versioned SQL migrations — **source of truth for the schema** |
| `apps/api/src/platform/migrate.ts` | Migration runner (auto-runs at startup) |
| `apps/api/src/platform/seed.ts` | Dev seed runner (auto-runs in non-production) |
| `db/seed/` | Placeholder — seed logic is now in `seed.ts` |

## How migrations work

On every API startup the runner:

1. Creates `schema_migrations` tracking table if absent.
2. Reads all `*.sql` files in `migrations/` sorted by filename (files starting with `_` are ignored).
3. Skips files already recorded in `schema_migrations`.
4. Applies each pending file's `-- migrate:up` block in a transaction and records it.
5. Aborts startup with a clear error log if any migration fails.

## Adding a schema change

1. Copy `apps/api/src/platform/migrations/_TEMPLATE.sql` →
   `YYYYMMDDHHMMSS_describe_change.sql` (UTC timestamp prefix).
2. Fill the `-- migrate:up` block (and the matching `-- migrate:down`).
3. Update `docs/data-model.md` and the matching `docs/schema/<table>.md` in the same change.
4. Restart the API — the migration is applied automatically.

## Rules

- Change the schema **only** through a new migration file. Never edit an already-applied migration.
- Keep `docs/data-model.md` and `docs/schema/` updated **in the same change** as any migration.
- The DB carries everything: metadata, KB, vectors (`pgvector`, HNSW), graph adjacency,
  the job queue (`SKIP LOCKED`), and encrypted tokens. No second data system without an ADR (ADRs 0003–0006).
- Every derived-knowledge table keeps **`confidence` + citation** columns (NFR-7).

See `.cursor/rules/data-model.mdc` for the enforced version of these rules.
