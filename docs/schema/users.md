# `users`

> **Status:** implemented  
> **Domain:** Identity & projects

Accounts with email/password auth and RBAC role assignment.

## Columns

| Column | Type | Null | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key |
| `email` | `text` | NO | — | Unique login email |
| `password_hash` | `text` | NO | — | Bcrypt (or equivalent) password hash; never store plaintext |
| `role` | `user_role` | NO | `'developer'` | RBAC role: `admin`, `expert`, `developer`, `end_user`, `system` (internal only) |
| `created_at` | `timestamptz` | NO | `now()` | Account creation time (UTC) |
| `updated_at` | `timestamptz` | NO | `now()` | Last row update (UTC); set by `BEFORE UPDATE` trigger |
| `created_by` | `uuid` | NO | — | FK → `users.id`; actor who created the row |
| `updated_by` | `uuid` | NO | — | FK → `users.id`; actor who last updated the row |
| `status` | `char(1)` | NO | `'A'` | Row visibility: `A` = active, `D` = soft-deleted |

## Constraints

- `email` is `UNIQUE`.
- `status` must be `A` or `D` (`users_status_check`).

## Indexes

None beyond the primary key and unique constraint on `email`.

## Service accounts (`role = system`)

Seeded by migration; not exposed in OpenAPI; cannot log in. See ADR 0018.

| Email | Fixed `id` | Writer |
|---|---|---|
| `api-system@codesage.internal` | `a0000001-0000-4000-8000-000000000001` | Node seed, system enqueue |
| `rag-worker@codesage.internal` | `a0000001-0000-4000-8000-000000000002` | RAG/Python writes |
| `webhook-handler@codesage.internal` | `a0000001-0000-4000-8000-000000000003` | Webhook job enqueue |

## Foreign keys

| Column | References | On delete |
|---|---|---|
| `created_by` | `users(id)` | (no action) |
| `updated_by` | `users(id)` | (no action) |
