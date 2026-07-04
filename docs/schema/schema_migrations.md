# `schema_migrations`

> **Status:** implemented (created by migration runner, not a versioned migration file)  
> **Domain:** Operations

Tracks which SQL migration files have been applied. Managed by `apps/api/src/platform/migrate.ts`.

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
