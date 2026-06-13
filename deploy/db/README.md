# deploy/db/ — Machine 1 (Database)

> **Status:** Empty placeholder. `compose.db.yml` lands in Phase 0.

Runs **PostgreSQL + pgvector** — the single datastore (metadata, KB, vectors, graph, job queue,
encrypted tokens).

## Planned (Phase 0)

- [ ] `compose.db.yml` — `postgres` with the `pgvector` extension image.
- [ ] Persistent volume for data; tuned `shared_buffers` / `work_mem` for HNSW caching.
- [ ] Backup hook (see `scripts/`).
- [ ] Config via env only; **no secrets committed** (see `../../.env.example`).
