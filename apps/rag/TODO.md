# apps/rag — TODO

Global sequencing: `docs/final-solution.md` §12. All modules under `src/`.

## api/
- [x] FastAPI app + `/health` + worker lifespan.
- [ ] `POST /rag/query` route (streaming).
- [ ] Wire to `services/` QA pipeline.

## workers/
- [x] Job type registry + background thread skeleton.
- [ ] Procrastinate consumer loop + handler dispatch to `services/`.

## config/
- [x] Settings + env loading.
- [ ] Repo-token decryption.

## models/
- [x] ORM for migrated tables + enums.
- [ ] Derived-knowledge + expert + conversation models (when migrations land).

## repositories/
- [x] Repos per table group; session helpers; pgvector + graph queries.
- [ ] Repos for new tables as migrations land.

## services/ (Phase 1+)
- [ ] `parsing/` — tree-sitter, chunking.
- [ ] `embedding/` — TEI.
- [ ] `graph/` — graph orchestration.
- [ ] `llm/` — provider + prompts.
- [ ] `retrieval/` — RAG retrieval + rerank.
- [ ] `router/` — question classifier.
- [ ] `distill/` — derived knowledge extractors.
- [ ] `experts/` — expert loop.

## Cross-cutting
- [ ] Tests per layer; lint clean.
