# ADR 0015 — Single Python deployable for MVP (`apps/rag`)

- **Status:** Accepted
- **Date:** 2026-06-22
- **Related:** `final-solution.md` §3–§4, §11; ADR 0002, ADR 0012, ADR 0014

## Context

The finalized architecture originally split Python across multiple deployables and packages.
For **MVP**, that added ops cost without independent scaling benefit.

## Decision

**One Python deployable under `apps/rag`**, organized in **layers**:

| Layer | Role |
|---|---|
| `api/` | HTTP (FastAPI) — thin |
| `workers/` | Job consumer dispatch — thin |
| `services/` | Business logic |
| `repositories/` | Data access (Postgres, pgvector, graph) |
| `models/` | SQLAlchemy ORM |
| `config/` | Settings, env |

Node contract unchanged: enqueue jobs to Postgres; proxy QA to the RAG HTTP API.

## Consequences

- One Python image, one CI project, conventional layered layout.
- Clear dependency direction: I/O layers → services → repositories → models.
- Escape hatch: split workers or extract layers if scaling requires it.

## Alternatives considered

- **Two Python services + shared library:** rejected for MVP.
- **`py_core/` package name:** replaced by layered `services/` + `repositories/` + `models/`.

## Escape hatch

Split queue consumers or publish shared layers as packages when scaling demands it; supersede
this ADR when that happens.
