# `schema_migrations`

> **Status:** implemented (created by migration runner, not a versioned migration file)  
> **Domain:** Operations

Internal bookkeeping table recording which versioned SQL migration files have been applied to this
database instance. The API migration runner (`apps/api/src/platform/migrate.ts`) creates this table
on first boot, then inserts one row per successfully executed file under
`apps/api/src/platform/migrations/`. It is not a domain table — no audit columns, no soft delete —
and exists only to make schema upgrades idempotent across deploys.

## Columns

| Column | Type | Null | Default | Description |
|---|---|---|---|---|
| `version` | `text` | NO | — | Primary key; migration filename, e.g. `20260613120000_init.sql` |
| `applied_at` | `timestamptz` | NO | `now()` | When the migration was applied (UTC) |

## Constraints

None beyond the primary key on `version`.

## Indexes

None beyond the primary key.

## Foreign keys

None.
