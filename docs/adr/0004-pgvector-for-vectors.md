# ADR 0004 — pgvector for semantic code retrieval

- **Status:** Accepted
- **Date:** 2026-06-13
- **Related:** `intermediate-solution.md` §3.3, ADR 0003

## Context

Semantic code retrieval needs a vector store. We estimate ~0.5M–1.5M chunk vectors total
(10 projects × ~3M LOC, ~40–60 LOC/chunk). We want to avoid running a second data system if
Postgres can do the job at this scale.

## Decision

Use **pgvector** inside PostgreSQL with an **HNSW index** and **`halfvec` (fp16)** storage to
roughly halve the footprint. Vectors live in the same DB as metadata and the graph, so
retrieval can join semantic results with structured filters transactionally.

## Consequences

- One fewer system; vectors are transactional with metadata.
- Fewer ANN tuning knobs than dedicated stores; very-large-scale tuning needs care.
- RAM must be budgeted so the HNSW index stays cached (Machine 1: 64–128 GB).

## Alternatives considered

- **Qdrant:** fast, great hybrid search/DX — but another service. Documented as the migration
  target if we outgrow pgvector.
- **Weaviate / Milvus:** heavier/operationally complex; overkill at MVP scale.

## Escape hatch

Migrate to **Qdrant** if we reach many millions of vectors or need heavy hybrid filtering.
Retrieval is isolated behind `py-core/retrieval`, so the swap is contained.
