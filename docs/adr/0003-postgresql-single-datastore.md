# ADR 0003 — PostgreSQL as the single datastore

- **Status:** Accepted
- **Date:** 2026-06-13
- **Related:** `intermediate-solution.md` §3.5, `final-solution.md` §2, §5

## Context

CodeSage needs to persist: relational metadata, a flexible knowledge base, vector embeddings,
a code graph, a job queue, and encrypted repo tokens. Each could be a separate system, but the
MVP goal is **minimal moving parts** for a self-hosted, open-source deployment.

## Decision

Use **PostgreSQL** as the single datastore for everything:

- Metadata + KB (relational + JSONB for flexible artifacts),
- Vectors via `pgvector` (ADR 0004),
- Code graph via adjacency tables + recursive CTEs (ADR 0005),
- Job queue via `SKIP LOCKED` / Procrastinate (ADR 0006),
- Encrypted tokens (app-level envelope encryption).

PostgreSQL is the **only stateful service**; everything else is stateless containers plus a
filesystem for cloned repos.

## Consequences

- One engine to run, back up, and secure; transactional consistency across all data.
- Schema migrations required; deeply nested KB docs are less "natural" than in a document DB.
- Operationally simple for a single-organization, on-prem MVP.

## Alternatives considered

- **MongoDB (Community / SSPL):** team familiarity (MEAN/MERN), good for nested docs — but
  SSPL is not OSI open source, and it still leaves vectors, graph, and queue to solve
  separately (more moving parts). Rejected.
- **MySQL/MariaDB:** weaker JSON/extension story, no pgvector equivalent. Rejected.

## Escape hatch

If specific workloads outgrow Postgres, peel them off individually (e.g. Qdrant for vectors —
ADR 0004; Neo4j for graph — ADR 0005; a broker for the queue — ADR 0006). The consolidation is
a default, not a lock-in.
