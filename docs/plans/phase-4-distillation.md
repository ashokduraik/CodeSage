# Phase 4 — Distillation (derived product knowledge)

Implementation plan per [`final-solution.md` §12](../final-solution.md). Architecture:
[ADR 0025](../adr/0025-distillation-derived-knowledge.md).

**Exit criteria:** Derived knowledge queryable for one project (workflows, pages, permissions,
data flows with confidence + citations).

**Out of scope for Phase 4:** expert question queue (Phase 5), product-audience router / end-user
QA (Phase 6), full web explorer UI.

---

## Milestones

### M1 — Schema + repositories (complete)

| Task | Module | Deliverables |
|---|---|---|
| Migration for four tables | `apps/api/src/platform/migrations/20260712200000_derived_knowledge_tables.sql` | `is_stale`, `is_expert_override`, audit columns |
| ORM models | `apps/engine/src/models/derived_knowledge.py` | `Workflow`, `PageMap`, `PermissionRule`, `DataFlow` |
| Repositories | `apps/engine/src/repositories/derived_knowledge.py` | upsert, list, staleness marking |

### M2 — `distill` job shell + enqueue (complete)

| Task | Module | Deliverables |
|---|---|---|
| Handler + dispatch | `services/distill/run_distill.py`, `workers/handlers/dispatch.py` | `distill` consumer registered |
| Auto-enqueue | `services/indexing/distill_enqueue.py` | After xrepo or single-repo embed |
| Incremental staleness | `run_parse.py`, `run_embed.py` | Mark stale + enqueue `staleArtifactIds` |

### M3 — Graph walk + distillation pipeline (complete)

| Task | Module | Deliverables |
|---|---|---|
| Entrypoint discovery | `services/distill/entrypoints.py` | Recursive CTE walk from routes/http_calls |
| Context packer | `services/distill/context.py` | Chunk excerpts for LLM prompts |
| Heuristic + LLM paths | `heuristic.py`, `pipeline.py`, `llm/distill_client.py` | Full + incremental derive |

### M4 — Node read API (complete)

| Task | Module | Deliverables |
|---|---|---|
| OpenAPI shapes | `contracts/openapi.node.yaml` | Four GET knowledge list routes |
| Knowledge module | `apps/api/src/modules/knowledge/` | routes + service + repository |
| Dashboard | `dashboard.service.ts` | `knowledgeCount` wired |

---

## Definition of Done (Phase 4)

- [x] Four derived-knowledge tables migrated; `data-model.md` + `docs/schema/*` updated
- [x] `distill` worker handler registered; auto-enqueue after index; incremental stale path
- [x] Heuristic + LLM extractors persist confidence + `source_refs`; override guard in repos
- [x] Node GET `/projects/:id/workflows|pages|permissions|data-flows` live
- [x] `DISTILL_*` constants in `constants.py`; `VLLM_DISTILL_MODEL` in `.env.example`
- [x] Tests on touched packages
- [x] ADR 0025 **Accepted**

---

## Manual verification

1. Index a test project (single or multi-repo).
2. Wait for `distill` job to complete in `jobs` table.
3. `GET /api/projects/:id/workflows` returns rows with `confidence` and `sourceRefs`.
4. Push a change to a cited file → parse marks stale → incremental distill refreshes.
