# Phase 1 — MVP Code QA

Implementation plan for Phase 1 per [`final-solution.md` §12](../final-solution.md).

**Exit criteria:** Ask a code question on one repo and receive a correct, cited answer (developer audience).

**Out of scope for Phase 1:** multi-repo linking (Phase 2), webhooks/cron freshness (Phase 3),
distillation (Phase 4), expert loop (Phase 5), end-user product QA (Phase 6).

---

## Prerequisites

| Dependency | Purpose | Notes |
|---|---|---|
| PostgreSQL + pgvector | Vectors, graph, jobs | Already in Compose |
| TEI (Text Embeddings Inference) | Code chunk embeddings | Self-hosted; `halfvec` storage |
| vLLM (or Ollama for dev) | Grounded answer generation | Self-hosted on GPU |
| Git clone access | Initial sync | Decrypt repo token from `repos.token_enc` |

Document env vars in `.env.example` as each integration lands.

---

## Milestones

### M1 — Contracts & codegen (Week 1 gate)

Lock cross-service shapes before implementation.

| Task | Owner | Files |
|---|---|---|
| Define `POST /rag/query` (SSE/stream chunks, citations, abstain) | contracts | `contracts/openapi.rag.yaml` |
| Finalize job payload types (sync → parse → embed chain) | contracts | `contracts/jobs.schema.json` |
| Generate TS types (incl. job payloads) | shared-types | `npm run codegen` |
| Generate Pydantic models for RAG + jobs | rag | py-core codegen (when wired) |

**Done when:** `npm run codegen:check` passes; both services compile against generated types.

### M2 — Indexing pipeline (critical path)

End-to-end: attach repo → indexed chunks in pgvector.

```mermaid
flowchart LR
  A[sync job] --> B[Clone repo]
  B --> C[parse job]
  C --> D[tree-sitter + chunk]
  D --> E[embed job]
  E --> F[TEI → pgvector]
  F --> G[last_indexed_sha]
```

| Step | Module | Key deliverables |
|---|---|---|
| 1 | `services/sync/` | Clone/fetch repo; enumerate changed files; update `last_indexed_sha` |
| 2 | `config/` | Decrypt `repos.token_enc` (AES-256-GCM, shared key with Node) |
| 3 | `services/parsing/` | tree-sitter JS/TS/TSX; AST-aware chunking (~40–60 LOC windows) |
| 4 | `services/embedding/` | TEI client; upsert `code_chunks` (pgvector `halfvec`) |
| 5 | `services/graph/` | Extract `graph_nodes` / `graph_edges` during parse |
| 6 | `workers/handlers/` | Procrastinate consumer; dispatch sync/parse/embed; idempotent handlers |
| 7 | `repositories/indexing.py` | Upsert chunks, nodes, edges; job status updates |

**Done when:** Attach a repo via API → worker completes sync/parse/embed → `code_chunks` rows exist with embeddings.

### M3 — RAG query path

| Step | Module | Key deliverables |
|---|---|---|
| 1 | `services/retrieval/` | Vector search over `code_chunks`; optional graph expansion |
| 2 | `services/llm/` | vLLM provider; grounded prompt assembly |
| 3 | `services/router/` | Phase 1: code-only path (product router stub returns code) |
| 4 | `api/routes/query.py` | `POST /rag/query` — SSE stream of answer chunks + citations |
| 5 | Abstain path | Return "not certain" when retrieval confidence is below threshold (NFR-7) |

**Done when:** `curl POST /rag/query` with a developer question returns streamed answer + code citations.

#### M3.1 — Hybrid retrieval (ADR 0020) — **done**

Vector-only retrieval ranked exact identifiers/symbols poorly (broad, low-precision answers).
`services/retrieval/` now runs symbol, keyword (`pg_trgm`), and vector search in parallel and
fuses them with **Reciprocal Rank Fusion** before graph expansion.

| Step | Module | Key deliverables |
|---|---|---|
| 1 | migration | `pg_trgm` extension + GIN indexes on `code_chunks.content` and `graph_nodes.name` |
| 2 | `services/retrieval/` | Keyword + symbol retrievers (`repositories/keyword.py`, `repositories/symbols.py`) |
| 3 | `services/retrieval/` | RRF fusion (`fusion.py`) feeding graph expand |
| 4 | `config/` | Per-retriever top-k, weights, RRF `k`, min similarity thresholds |

**Done when:** an identifier question (e.g. "what does `getMinEmi` do?") ranks the defining chunk
first and the answer traces that symbol instead of surveying the codebase.

#### M3.2 — Retrieval quality pass (ADR 0021) — **done**

M3.1 equal-weight RRF still let vector neighbours dilute symbol hits and packed too many chunks
into the LLM prompt. M3.2 adds intent-aware weighting, adaptive top-k, post-graph prune, and a
hybrid confidence gate.

| Step | Module | Key deliverables |
|---|---|---|
| 1 | `services/retrieval/query_intent.py` | Heuristic intent signals (identifier vs conceptual) |
| 2 | `services/retrieval/fusion.py` | Dynamic RRF weight profiles (`symbol_lookup`, `conceptual`, `balanced`) |
| 3 | `services/retrieval/search.py` | Adaptive per-leg top-k by project size; post-graph prune to 8–10 |
| 4 | `services/retrieval/` | Hybrid confidence score (retrieval + graph + symbol + citation coverage) |
| 5 | `config/` | `RETRIEVAL_MIN_CONFIDENCE`, prune size, weight profiles, adaptive tier thresholds |

**Done when:** identifier questions keep symbol-defined chunks in the top 3 after prune; conceptual
questions no longer receive 15+ loosely related excerpts; abstain fires when hybrid confidence is
below threshold.

#### M3.3 — Cross-encoder reranker (ADR 0021) — **done**

Optional open-source reranker (`BAAI/bge-reranker-v2-m3` via TEI `/rerank`) reorders top
~25 fused candidates to top 8 before context packing. Feature-flagged; off by default.

| Step | Module | Key deliverables |
|---|---|---|
| 1 | `services/retrieval/rerank.py` | Rerank client + integration after fusion/graph |
| 2 | `config/` | `RETRIEVAL_RERANKER_ENABLED`, endpoint, model id, candidate limits |
| 3 | ops | `tei-rerank` service in `docker-compose.gpu.yml`; hosting docs |

**Done when:** with reranker enabled, precision@8 improves on a small golden set of code-QA
questions without breaking abstain behaviour.

### M4 — Node chat proxy + persistence

| Step | Module | Key deliverables |
|---|---|---|
| 1 | `modules/chat/` | Conversation CRUD (`/conversations`, `/conversations/{id}/messages`) |
| 2 | Proxy | `POST /chat/query` — persist user/assistant messages, build `history`, stream RAG SSE |
| 3 | Contracts | `ChatMessage`, `CreateConversationRequest`, `ChatQueryRequest { conversationId, question }` |
| 4 | Abort | Propagate client disconnect → abort upstream RAG fetch |

**Done when:** Authenticated client creates a conversation, sends a question, receives streamed tokens, and messages are stored in PostgreSQL (including partial on stop).

### M5 — Web UI integration

| Step | Feature | Key deliverables |
|---|---|---|
| 1 | API client | `chatClient.ts` — conversation CRUD + SSE query with `AbortSignal` |
| 2 | Chat | Server-backed session list + message thread; stop button; context meter |
| 3 | Projects | Per-repo index/job status display |
| 4 | Chat | Multi-turn follow-ups use prior messages from DB (via Node → RAG `history`) |

**Done when:** User logs in → attaches repo → waits for index → asks code question → sees cited streamed answer → asks follow-up in same conversation → stop mid-stream keeps partial answer.

---

## Build order (recommended)

1. **Contracts** — unblocks all teams.
2. **Sync handler** — proves job queue end-to-end (Node enqueues → Python consumes).
3. **Parse + embed** — populates pgvector.
4. **RAG query API** — retrieval + LLM + citations.
5. **Chat WebSocket** — Node proxy.
6. **Web wiring** — replace mocks.

Each milestone should ship with colocated tests (≥ 80% line + branch on all workspaces).

---

## External service setup (dev)

For local development without GPU:

- **TEI:** Run embedding model container; point `EMBEDDING_URL` at it.
- **vLLM/Ollama:** Run inference container; point `LLM_URL` at it.
- Document minimal compose overlay or `docs/development-workflow.md` addendum when services are wired.

---

## Definition of Done (Phase 1)

- [ ] Exit criteria met on a single test repo (E2E journey #3 in [`workflows.md`](../../tests/e2e/workflows.md) — `npm run test:e2e` with stack up).
- [x] All shapes from `contracts/`; codegen drift check passes.
- [x] Node never blocks on heavy work (sync/parse/embed/query stay in Python).
- [x] Answers include citations; abstain path works (NFR-7).
- [x] Tests ≥ 80% (line + branch) on all workspaces; lint + typecheck clean in CI.
- [x] `TODO.md` / `PLAN.md` updated in each touched component.
- [x] `.env.example` documents new variables (TEI/vLLM model ids + `docker-compose.gpu.yml`).
- [x] Graph expansion settings documented in `apps/rag/.env.example` (Phase 2 uses defaults).

---

## Handoff to Phase 2

Multi-repo linking is implemented — see [`phase-2-multi-repo.md`](./phase-2-multi-repo.md).

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| TEI/vLLM unavailable in CI | Mock providers in unit tests; optional manual GPU smoke test |
| Large repo clone times | File filters, size limits, skip vendored dirs (see `final-solution.md` §6.1) |
| Embedding dimension mismatch | Lock model + dimension in config; validate on first embed |
| Low retrieval quality | Hybrid retrieval — symbol + keyword (`pg_trgm`) + vector fused with RRF (ADR 0020, M3.1); tune chunk size/top-k; cross-encoder reranker deferred |

---

## References

- [`final-solution.md` §6](../final-solution.md) — indexing pipeline
- [`final-solution.md` §8](../final-solution.md) — QA serving flow
- [`architecture.md`](../architecture.md) — component map
- [`data-model.md`](../data-model.md) — schema reference
- Component plans: `apps/rag/PLAN.md`, `apps/api/PLAN.md`, `apps/web/PLAN.md`
