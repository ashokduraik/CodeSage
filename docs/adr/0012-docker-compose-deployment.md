# ADR 0012 — Docker Compose on two machines (Kubernetes deferred)

- **Status:** Accepted
- **Date:** 2026-06-13
- **Related:** `intermediate-solution.md` §3.11, §5, `final-solution.md` §11

## Context

CodeSage is single-organization, self-hosted, open-source. After consolidating data onto
PostgreSQL (ADR 0003), the service inventory is small (~5 services, 1 datastore). We need a
deployment topology for the MVP that is simple to stand up while keeping the door open for scale.

## Decision

Package everything as **Docker containers** and deploy with **Docker Compose across two
machines**:

- **Machine 1 (DB):** PostgreSQL + pgvector. 16 cores, 64–128 GB RAM, 1 TB NVMe (RAID1), no GPU.
- **Machine 2 (App + GPU):** Node API, Python RAG + workers, vLLM, TEI. 16–32 cores,
  64–128 GB RAM, 500 GB–1 TB NVMe, 1× 48 GB GPU.

Container-first means the same images later run under Kubernetes unchanged.

## Consequences

- Simplest possible ops for the MVP; fast to stand up on a single host pair.
- Limited scaling/HA and manual ops; GPU inference and workers can't scale independently yet.
- Clear upgrade path because artifacts are already containerized.

## Alternatives considered

- **Kubernetes (+ Helm) now:** independent scaling/HA/self-healing — but higher ops complexity
  and a steeper learning curve, unjustified at ~5 services. Deferred.

## Escape hatch

Move to **Kubernetes** when indexing workers or GPU inference need independent scaling (e.g. to
shrink the initial-index window or raise QA concurrency). No image changes required.
