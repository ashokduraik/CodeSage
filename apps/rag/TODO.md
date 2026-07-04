# apps/rag — TODO

Global sequencing: `docs/plans/phase-1-mvp-code-qa.md`. All modules under `src/`.

## api/
- [x] FastAPI app + `/health` + worker lifespan.
- [x] `POST /rag/query` route (SSE streaming).
- [x] Wire to `services/` QA pipeline (Phase 1 developer path + abstain).

## workers/
- [x] Job type registry + background thread.
- [x] Postgres queue consumer + handler dispatch (`sync`, `parse`, `embed`).
- [ ] Procrastinate migration (optional; ADR 0006 allows hand-rolled queue).

## config/
- [x] Settings + env loading.
- [x] Repo-token decryption (AES-256-GCM, matches Node).
- [x] Indexing logs (`config/logging.py`) — plain English, stdout, redaction. See `docs/rag-indexing-logs.md`.

## models/
- [x] ORM for migrated tables + enums.
- [ ] Derived-knowledge + expert + conversation models (when migrations land).

## repositories/
- [x] Repos per table group; session helpers; pgvector + graph queries.
- [ ] Repos for new tables as migrations land.

## services/ (Phase 1)
- [x] `sync/` — git clone/fetch + file enumeration + enqueue parse.
- [x] `parsing/` — tree-sitter symbol boundaries + line-window fallback.
- [x] `embedding/` — TEI client + deterministic dev fallback.
- [x] `retrieval/` — vector search + abstain threshold.
- [x] `qa/` — SSE answer streaming with citations.
- [x] `graph/` — file + symbol node extraction during parse.
- [x] `llm/` — vLLM streaming provider with excerpt fallback when unset.
- [x] `router/` — Phase 1 code-only path (`developer`; `end_user` abstains).
- [ ] `distill/` — derived knowledge extractors (Phase 4).
- [ ] `experts/` — expert loop (Phase 5).

## Cross-cutting
- [x] Contract codegen wired (Pydantic in `src/generated/`).
- [x] Structured indexing logs (stdout, beginner-friendly, full activity). See `docs/rag-indexing-logs.md`.
