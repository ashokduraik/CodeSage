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
- [x] `20260614000000_jobs_and_audit.sql` — `jobs` queue + `audit_log`.
- [x] `20260619000000_project_status_enum.sql` — typed `project_status` enum on `projects`.
- [x] `20260620100000_indexing_tables.sql` — `graph_nodes`, `graph_edges`, `code_chunks`
      (pgvector `vector(1024)` + HNSW index; requires pgvector extension).

## Planned next (from `docs/data-model.md`)

- [ ] derived knowledge: `workflows`, `page_map`, `permission_rules`, `data_flows`
      (each with `confidence` + citation columns).
- [ ] `expert_questions`, `expert_answers`.
- [ ] `conversations`, `messages`.
