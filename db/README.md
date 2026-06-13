# db/ — Database schema & seed data

PostgreSQL (+pgvector) is the **single datastore** (ADR 0003). This folder owns the schema and
dev data.

> **Status:** First migration written and verified via dbmate (`docker compose run --rm migrate up`).

## Layout

| Path | Purpose |
|---|---|
| `migrations/` | Versioned SQL migrations — **the source of truth for the schema.** |
| `seed/` | Dev seed data & fixtures (never production data). |

## Rules (one concern, one place)

- The schema changes **only** through a new file in `migrations/`. Never edit a previously
  applied migration; add a new one.
- Keep [`docs/data-model.md`](../docs/data-model.md) updated **in the same change** as any
  migration — it is the human/agent-readable mirror of the schema.
- The DB carries everything: metadata, KB, vectors (`pgvector`, `halfvec` + HNSW), graph
  adjacency, the job queue (`SKIP LOCKED`), and encrypted tokens. No second data system without
  an ADR (ADRs 0003–0006).
- Every derived-knowledge table keeps **`confidence` + citation** columns (NFR-7).

See `.cursor/rules/data-model.mdc` for the enforced version of these rules.
