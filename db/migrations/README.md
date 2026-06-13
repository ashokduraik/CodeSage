# db/migrations/ — Versioned SQL migrations (schema source of truth)

> **Status:** First migration written and verified (`20260613120000_init.sql`). Tool: **dbmate**
> (ADR 0014). Run via `docker compose run --rm migrate up` (or `make migrate`).

## Conventions

- Tooling is **dbmate**: each file has a `-- migrate:up` and `-- migrate:down` section.
- **Append-only** — never edit an applied migration; add a new one.
- Naming is dbmate's timestamp prefix: `YYYYMMDDHHMMSS_description.sql`.
- Enable required extensions early (`CREATE EXTENSION IF NOT EXISTS vector;`).
- Update [`../../docs/data-model.md`](../../docs/data-model.md) in the same change.

## Migrations

- [x] `20260613120000_init.sql` — extensions (`vector`, `pgcrypto`) + `users`, `projects`,
      `repos` (with `token_enc`, `last_indexed_sha`).

## Planned next (from `docs/data-model.md`)

- [ ] `code_chunks` (pgvector `halfvec` + HNSW index), `graph_nodes`, `graph_edges`.
- [ ] derived knowledge: `workflows`, `page_map`, `permission_rules`, `data_flows`
      (each with `confidence` + citation columns).
- [ ] `expert_questions`, `expert_answers`.
- [ ] `conversations`, `messages`, `audit_log` (the Procrastinate queue manages its own tables).
