# deploy/app/ — Machine 2 (Application + GPU)

> **Status:** Empty placeholder. `compose.app.yml` lands in Phase 0/1.

Runs the stateless app/worker/inference containers.

## Planned (Phase 0/1)

- [ ] `compose.app.yml` with services:
  - [ ] `api` — Node non-blocking API (also serves the React bundle from `apps/web`).
  - [ ] `rag` — Python RAG/QA service.
  - [ ] `worker` — Python queue consumers (sync/parse/embed/xrepo/distill).
  - [ ] `vllm` — LLM inference (GPU).
  - [ ] `tei` — embeddings (GPU).
- [ ] GPU passthrough for `vllm` / `tei`.
- [ ] Filesystem volume for cloned repos + model weights + scratch.
- [ ] Points at Machine 1's PostgreSQL via env; **no secrets committed** (see `../../.env.example`).
