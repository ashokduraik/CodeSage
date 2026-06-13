# deploy/ — Deployment (Docker Compose, two machines)

MVP topology is **Docker Compose across two on-prem machines** (ADR 0012). Everything is
container-first so the same images later run under Kubernetes unchanged.

> **Status:** Scaffolded with READMEs only. **No compose files / Dockerfiles written yet.**

## Layout

| Path | Machine | Runs |
|---|---|---|
| `db/` | Machine 1 — Database | PostgreSQL + pgvector (the only stateful service). |
| `app/` | Machine 2 — App + GPU | Node `api`, Python `rag` + `worker`, `vllm`, `tei`. |

## Hardware (see `docs/final-solution.md` §11)

- **Machine 1:** 16 cores, 64–128 GB RAM, 1 TB NVMe (RAID1), no GPU.
- **Machine 2:** 16–32 cores, 64–128 GB RAM, 500 GB–1 TB NVMe, **1× 48 GB GPU** (L40S/A6000).

## Rules

- **No secrets in compose files.** Configuration comes from environment / `.env` (see
  [`../.env.example`](../.env.example)); real `.env` files are never committed.
- ~5 services, 1 datastore — keep it simple until scaling needs justify Kubernetes (ADR 0012).
- Images are built from the deployables (`apps/api`, `services/rag`, `services/worker`) + upstream
  images for `postgres`, `vllm`, `tei`.
