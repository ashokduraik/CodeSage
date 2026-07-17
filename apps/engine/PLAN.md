# apps/engine — Implementation Plan

Layered Python backend under **`src/`**: **api → services → repositories → models**.

## Build order

### Foundation (started)
1. **`config/`** — settings, env. ✅
2. **`models/`** — SQLAlchemy ORM, enums. ✅
3. **`repositories/`** — repos, session, pgvector/graph helpers. ✅
4. **`api/`** — FastAPI skeleton, `/health`. ✅
5. **`workers/`** — job registry + consumer skeleton. ✅

### Business logic — `services/` (Phases 1–4)
1. **`services/parsing/`** — tree-sitter, chunking. ✅
2. **`services/embedding/`** — TEI client + playbook invalidation hook. ✅
3. **`services/graph/`** — graph build/query orchestration + API signal extraction. ✅
4. **`services/xrepo/`** — cross-repo HTTP call ↔ route linking (Phase 2). ✅
5. **`services/llm/`** — vLLM/Ollama provider, tool calling, prompts, capability probe. ✅
6. **`services/retrieval/`** — retained symbol/keyword/vector/RRF, adaptive top-k, and hybrid
   confidence primitives used by agent tools (ADR 0020/0021). Fixed prune/reranker orchestration
   is removed. ✅
7. **`services/qa/tools.py`** — seven bounded retrieval tools; graph expansion is planner-selected. ✅
8. **`services/qa/agent_loop.py`** — planner/tool loop, evidence pool, deterministic confidence,
   grounded stream, trace, and max-iteration abstention (ADR 0026). ✅
9. **`services/qa/playbooks.py`** — successful-trace promotion, similarity hints, changed-file
   invalidation, anchor validation, and default-off warm-start (ADR 0027). ✅
10. **`services/router/`** — audience dispatch; developer requests use the agent path. ✅
11. **`services/distill/`** — workflow/page/permission/data-flow extractors. ✅
12. **`services/experts/`** — confidence, expert questions (Phase 5). ⏳

### Wiring
1. **`api/routes/query.py`** — `POST /engine/query`, streams via services. ✅
2. **`workers/handlers/`** — dispatch `sync`, `parse`, `embed`, `xrepo` to services. ✅
3. **Job dedup** — orphan reclaim on worker start; API supersession + 409 re-index throttle. ✅
4. **`indexing/xrepo_enqueue.py`** — auto-queue `xrepo` when multi-repo project is fully indexed. ✅
5. **Hardening pass** — worker reliability, internal-only RAG network boundary, git credential handling, retrieval/contract fixes. ✅
6. **Agent QA contracts + persistence** — SSE tool events/metrics and `investigation_trace`. ✅
7. **Developer-chat E2E journey** — citations, follow-up, abstain/review, and planner social turn;
   live-stack execution requires a tool-calling model. ✅

## Definition of Done

- Layers respected; logic only in `services/`.
- Citations + abstain path; jobs idempotent.
- Shapes from `contracts/`; tests passing.
