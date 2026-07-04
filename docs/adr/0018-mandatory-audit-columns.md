# ADR 0018: Mandatory audit columns on domain tables

**Status:** Accepted

## Context

CodeSage needs consistent row-level attribution for compliance, debugging, and expert
overrides. Human users authenticate via JWT; background work is performed by the Node API,
RAG workers, and webhook intake without a human session. We must know who created and last
updated every domain row without ad-hoc per-table conventions.

## Decision

Every **domain table** carries these columns (in addition to row `status` per
`row-status.mdc`):

| Column | Type | Set by |
|---|---|---|
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | DB default on insert |
| `created_by` | `uuid NOT NULL REFERENCES users(id)` | Application on insert |
| `updated_at` | `timestamptz NOT NULL DEFAULT now()` | PostgreSQL `BEFORE UPDATE` trigger |
| `updated_by` | `uuid NOT NULL REFERENCES users(id)` | Application on update |

**Excluded tables:** `schema_migrations` (runner metadata), `audit_log` (append-only event
stream with its own `actor_id` + `ts`).

**Service users** (seeded in migration, `role = system`, not exposed in OpenAPI):

| Email | Fixed UUID | Writer |
|---|---|---|
| `api-system@codesage.internal` | `a0000001-0000-4000-8000-000000000001` | Node seed, system enqueue |
| `rag-worker@codesage.internal` | `a0000001-0000-4000-8000-000000000002` | All RAG/Python writes |
| `webhook-handler@codesage.internal` | `a0000001-0000-4000-8000-000000000003` | Webhook job enqueue only |

**Actor precedence:**

1. Authenticated API request → JWT `sub` (human wins over service fallback).
2. Webhook intake enqueue → `webhook-handler`.
3. RAG worker / Python service → `rag-worker` (fixed UUID constants; no per-write DB fetch).
4. Bootstrap / seed → `api-system`; service users self-reference on insert.

**Implementation:**

- Migration `20260704120000_audit_columns_and_service_users.sql` adds columns, backfills,
  FKs, and `set_row_updated_at()` triggers.
- Node: `apps/api/src/platform/serviceUsers.ts`; `enqueueJob(db, type, payload, actorId)`.
- Python: `apps/rag/src/config/service_users.py`, `repositories/audit.py` (`stamp_created`,
  `stamp_updated`).
- Both services call `assertServiceUsersExist` / `assert_service_users_exist` at startup.

## Consequences

- Every domain row is attributable; RAG indexing writes are distinguishable from human CRUD.
- `system` role exists in DB only — blocked from login; not in public `UserRole` contract.
- `updated_at` is always trustworthy (trigger); `updated_by` requires app discipline.
- New tables must include audit columns in their first migration (see `_TEMPLATE.sql`).

## Alternatives considered

- **PostgreSQL `COMMENT ON` only:** Not machine-readable for agents; rejected in favor of
  `docs/schema/`.
- **Nullable `created_by`:** Weakens attribution; rejected after backfill.
- **Per-write DB lookup for RAG actor:** Extra latency; rejected in favor of fixed UUIDs +
  startup validation.
- **`updated_by` via trigger:** Cannot know JWT/service context in SQL; kept in app code.

## Escape hatch

If attribution requirements grow (e.g. impersonation, multi-tenant service accounts), add new
service users with new fixed UUIDs and extend `resolveServiceUser` / `resolve_service_user`
— do not remove the column contract.
