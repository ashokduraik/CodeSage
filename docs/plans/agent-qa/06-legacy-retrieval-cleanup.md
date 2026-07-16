# Plan 06 — Legacy retrieval cleanup (delete dead QA pipeline code)

**ADR:** [0026](../../adr/0026-agent-orchestrated-developer-qa.md)  
**Depends on:** [05](./05-agent-loop-and-stream-replace.md)  
**Blocks:** plan 13 (doc acceptance)  
**Status:** Complete (2026-07-17)

---

## Goal

Remove code that only served the **fixed retrieve-then-answer** pipeline. Keep retriever
primitives used by `tools.py`. Repo must have **no unused** QA pipeline modules.

Also verify plan 02 completed removal of `RETRIEVAL_GRAPH_ENABLED` / `retrieval_graph_enabled`
(no leftover gate in `graph_expand.py` or Settings).

---

## Delete these files

| File | Reason |
|---|---|
| `apps/engine/src/services/retrieval/rerank.py` | Pipeline reranker removed |
| `apps/engine/tests/services/test_rerank.py` | Module deleted |
| `apps/engine/src/services/router/small_talk.py` | Should be gone in plan 05 — verify deleted |

---

## Slim `search.py`

**File:** `apps/engine/src/services/retrieval/search.py`

**Delete entirely:**

- `retrieve_code_chunks()`
- `is_confident_match()`
- `_matches_for_confidence()`
- Imports: `augment_matches_with_graph`, `prune_matches`, `rerank_matches`, `select_rerank_candidates`

**If nothing remains**, delete `search.py` and move any kept helpers elsewhere:

- `RetrievalContext` dataclass → move to `retrieval/types.py` if still needed by tests
- Otherwise delete `RetrievalContext` if only agent uses `RetrievalMatch` from pool

**Keep in retrieval package:**

- `fusion.py`, `query_intent.py`, `query_terms.py`, `adaptive_top_k.py`, `hybrid_confidence.py`
- `graph_expand.py` — used by `tools.py` `graph_expand` tool (import functions directly);
  **no** `retrieval_graph_enabled` early-return (removed in plan 02)
- `types.py`, `prune.py` — **delete `prune.py`** if no imports remain after search.py removal

**Delete or rewrite `augment_matches_with_graph`:**

- Automatic pipeline expand is gone after plan 05. Prefer moving neighbor→chunk mapping helpers
  into `tools.py` **or** keep thin helpers in `graph_expand.py` called only by the tool.
- Delete `augment_matches_with_graph` if nothing imports it; rewrite `test_graph_expand.py`
  to cover tool-facing helpers only.

Run before delete:

```bash
rg "prune_matches|retrieve_code_chunks|is_confident_match|rerank|retrieval_graph_enabled|RETRIEVAL_GRAPH_ENABLED" apps/engine
```

All matches must be tests/docs only — update or delete those tests.

---

## Delete or rewrite tests

| File | Action |
|---|---|
| `tests/services/test_retrieval_search.py` | **Delete** if only tested `retrieve_code_chunks`; or rewrite to test `search_hybrid` via `execute_tool` |
| `tests/services/test_retrieval.py` | **Delete** `is_confident_match` tests; move confidence tests to `test_agent_loop.py` or `test_hybrid_confidence.py` |
| `tests/services/test_prune.py` | **Delete** if `prune.py` deleted |

---

## Config cleanup

| Item | Action |
|---|---|
| `Settings.retrieval_reranker_*` fields | Remove from `config/__init__.py` |
| `RETRIEVAL_RERANKER_*` in `constants.py` | Remove |
| `Settings.retrieval_graph_enabled` | Must already be gone (plan 02); verify |
| `RETRIEVAL_MIN_CONFIDENCE` | Remove if no references |
| `check_reranker_backend` in `model_backends.py` | Remove |
| `docker-compose.gpu.yml` `tei-rerank` service | Remove if present and unused |
| `RETRIEVAL_GRAPH_MAX_DEPTH` / `RETRIEVAL_GRAPH_MAX_EXTRA_CHUNKS` | **Keep** in `constants.py` — used by `graph_expand` tool |

---

## Health / README

| File | Action |
|---|---|
| `apps/engine/README.md` | Remove M3.3 reranker section, small-talk section, monolithic pipeline steps 1–5; remove `RETRIEVAL_GRAPH_ENABLED` from env table |
| `apps/engine/src/services/health/__init__.py` | Drop reranker from health aggregate |
| `docs/plans/phase-1-mvp-code-qa.md` | Strike M3.3 as superseded; link agent-qa plans |
| `.cursor/rules/engine-config.mdc` | Verify no graph/reranker toggles listed (ADR 0026) |

---

## Tests (verification)

```bash
cd apps/engine && uv run pytest -q
rg "rerank|small_talk|retrieve_code_chunks|is_confident_match|prune_matches|retrieval_graph_enabled|RETRIEVAL_GRAPH_ENABLED" apps/engine/src
```

`src/` grep must return **empty**.

Full engine test suite green. Coverage gate still ≥ 80% repo-wide.

**No new E2E** — plan 09 covers.

---

## Documentation

| Doc | Update |
|---|---|
| `docs/adr/0020-hybrid-retrieval.md` | Add note at top: “QA orchestration superseded by ADR 0026; retrievers retained.” |
| `docs/adr/0021-retrieval-quality-pass.md` | Same note for pipeline diagram |
| `docs/adr/0023-cross-repo-linking.md` | M3 graph-augmented retrieval: no `RETRIEVAL_GRAPH_ENABLED`; tool-driven expand |
| `apps/engine/TODO.md` | Remove M3.3 reranker checkbox; remove graph toggle mentions |

---

## Definition of Done

- [x] Files in “Delete these files” are gone
- [x] `search.py` removed or contains no dead orchestration functions
- [x] `prune.py` / `rerank.py` gone if unused
- [x] Settings/constants have no reranker fields and no `retrieval_graph_enabled`
- [x] `rg` verification clean on `apps/engine/src` (includes `RETRIEVAL_GRAPH_ENABLED`)
- [x] All engine tests pass

---

## Rollback

Restore deleted modules from git; redeploy previous engine image.
