# ADR 0005 — Postgres adjacency tables for the code graph

- **Status:** Accepted
- **Date:** 2026-06-13
- **Related:** `intermediate-solution.md` §3.4, ADR 0003

## Context

CodeSage builds a per-project code graph (files, classes, functions, routes as nodes; calls,
imports, callers as edges) that spans all repos of a project, **including cross-repo edges**
(frontend → backend → IAM). We need to persist and traverse this graph.

## Decision

Store the graph as **adjacency tables** in PostgreSQL (`graph_nodes`, `graph_edges`) and
traverse with **recursive CTEs**. Cross-repo edges live in the same tables, scoped per project.

## Consequences

- Reuses the existing datastore; no extra system to operate.
- Graph stays transactional with code chunks and metadata.
- Deep/recursive multi-hop traversals are less elegant and may need query tuning.

## Alternatives considered

- **Neo4j:** purpose-built graph queries (Cypher), great for multi-hop — but an extra system
  with license/ops overhead. Documented as the escape hatch.
- **In-memory graph per query:** fast but doesn't persist; rebuild cost at 3M LOC is too high.

## Escape hatch

If multi-hop traversals become a measured bottleneck, migrate to **Neo4j Community Edition**.
Graph access is isolated behind `py-core/graph`, containing the change.
