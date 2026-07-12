# apps/rag — TODO

Global sequencing: `docs/plans/phase-1-mvp-code-qa.md`, `docs/plans/phase-2-multi-repo.md`, `docs/plans/phase-3-freshness.md`.

## api/
- [x] FastAPI app + `/health` + worker lifespan.
- [x] `POST /rag/query` route (SSE streaming).
- [x] Wire to `services/` QA pipeline (Phase 1 developer path + abstain).

## workers/
- [x] Job type registry + background thread.
- [x] Postgres queue consumer + handler dispatch (`sync`, `parse`, `embed`, `xrepo`).
- [x] Worker hardening — rollback-first failure handling, startup-only orphan reclaim, transient retries, per-repo freshness commits.

## Hardening (2026-07)
- [x] Network-only RAG deploy default (Compose internal service).
- [x] Git token handling via `GIT_ASKPASS` (no argv / stored remote secrets).
- [x] Contract-aligned `/rag/query` validation (generated `RagQueryRequest`).
- [x] Retrieval grounding fixes (rerank confidence, history budget reserve, graph chunk pick).
- [x] API signal + cross-repo parameterized route matching.

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

## services/ (Phase 1–2)
- [x] `sync/` — git clone/fetch + file enumeration + enqueue parse.
- [x] `parsing/` — tree-sitter symbol boundaries + line-window fallback.
- [x] `embedding/` — TEI client + deterministic dev fallback.
- [x] `retrieval/` — hybrid retrieval: symbol + keyword (`pg_trgm`) search + RRF fusion (ADR 0020).
- [x] `retrieval/` — M3.2 quality pass: dynamic weights, adaptive top-k, prune, hybrid confidence (ADR 0021).
- [x] `retrieval/` — M3.3 optional cross-encoder reranker (ADR 0021).
- [x] `qa/` — SSE answer streaming with citations.
- [x] `graph/` — file + symbol node extraction during parse; HTTP/route API signals (Phase 2).
- [x] `xrepo/` — cross-repo link resolver job (Phase 2).
- [x] `llm/` — vLLM streaming provider with excerpt fallback when unset.
- [x] `router/` — Phase 1 code-only path (`developer`; `end_user` abstains).
- [ ] `distill/` — derived knowledge extractors (Phase 4).
- [ ] `experts/` — expert loop (Phase 5).

## Cross-cutting
- [x] Contract codegen wired (Pydantic in `src/generated/`).
- [x] `indexing/xrepo_enqueue` — queue `xrepo` when all project repos are indexed (Phase 2).
- [x] `freshness/poll_repos` — scheduled poll fallback + `cron_poll` sync enqueue (Phase 3).
- [x] Structured indexing logs (stdout, beginner-friendly, full activity). See `docs/rag-indexing-logs.md`.
