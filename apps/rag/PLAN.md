# apps/rag — Implementation Plan

Layered Python backend under **`src/`**: **api → services → repositories → models**.

## Build order

### Foundation (started)
1. **`config/`** — settings, env. ✅
2. **`models/`** — SQLAlchemy ORM, enums. ✅
3. **`repositories/`** — repos, session, pgvector/graph helpers. ✅
4. **`api/`** — FastAPI skeleton, `/health`. ✅
5. **`workers/`** — job registry + consumer skeleton. ✅

### Business logic — `services/` (Phase 1+)
1. **`services/parsing/`** — tree-sitter, chunking.
2. **`services/embedding/`** — TEI client.
3. **`services/graph/`** — graph build/query orchestration.
4. **`services/llm/`** — vLLM/Ollama provider, prompts.
5. **`services/retrieval/`** — vector + graph retrieval, rerank.
6. **`services/router/`** — code vs product classifier.
7. **`services/distill/`** — workflow/page/permission extractors.
8. **`services/experts/`** — confidence, expert questions.

### Wiring
1. **`api/routes/query.py`** — `POST /rag/query`, streams via services.
2. **`workers/handlers/`** — dispatch each job type to the matching service.
3. **Job dedup** — orphan reclaim on worker start; API supersession + 409 re-index throttle. ✅

## Definition of Done

- Layers respected; logic only in `services/`.
- Citations + abstain path; jobs idempotent.
- Shapes from `contracts/`; tests passing.
