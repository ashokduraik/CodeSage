# ADR 0006 — Postgres-backed job queue (no broker)

- **Status:** Accepted
- **Date:** 2026-06-13
- **Related:** `intermediate-solution.md` §3.6, ADR 0003

## Context

Indexing can't run inside an HTTP request — cloning + parsing + embedding + distilling millions
of LOC takes minutes to hours. We need async processing with **survivability/retries**,
**concurrency control** (cap GPU/CPU usage, prioritize interactive QA), and a clean **landing
spot** for webhook/cron re-index triggers.

## Decision

Use a **Postgres-backed queue**: either **Procrastinate** (Python, Postgres-only, uses
`LISTEN/NOTIFY`) or a hand-rolled `jobs` table polled with `SELECT … FOR UPDATE SKIP LOCKED`.
Node enqueues jobs (rows); Python workers consume them. Payload shapes are defined in
`contracts/jobs.schema.json` (ADR 0001).

## Consequences

- No Redis/broker to run or back up; jobs are transactional with data writes.
- Not built for huge throughput — acceptable at our scale (10 projects, internal users).
- Fewer queue features than dedicated brokers; we build what we need (retries, attempts, locks).

## Alternatives considered

- **Celery + Redis/Valkey:** mature and feature-rich, but adds a service to run/back up.
- **Temporal:** durable workflows and great visibility, but heavier to operate; learning curve.

## Escape hatch

If job volume/throughput outgrows Postgres, move to **Celery + Valkey** or **Temporal**. The
enqueue (Node) and consume (worker) sides are contract-defined, so the backend can change
without touching callers.

## Amendment (2026-07-04) — supersession and orphan reclaim

- **Supersession:** Pending jobs for a `repoId` are soft-cancelled (`jobs.status = 'D'`) before Node enqueues a newer sync (manual re-index after the stale window, attach, webhook). Workers only claim `job_status = 'pending' AND status = 'A'`.
- **Orphan reclaim:** Single-worker MVP resets all active `running` jobs to `pending` on worker startup and before each claim — the previous process no longer holds the lock.
- **Re-index throttle:** Manual `POST …/sync` returns **409** when active jobs for the repo are younger than `WORKER_STALE_JOB_SECONDS` (shared with RAG stale reclaim, default 600s).
