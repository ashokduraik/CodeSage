# Plan 03 — QA retrieval tools (`services/qa/tools.py`)

**ADR:** [0026](../../adr/0026-agent-orchestrated-developer-qa.md)  
**Depends on:** [02](./02-config-and-constants.md)  
**Blocks:** plans 04–09  

---

## Goal

Implement **all** retrieval tools in **one module** `apps/engine/src/services/qa/tools.py`
(target &lt; 1000 lines). Tools wrap existing repositories; no SQL exposed to callers.

**Do not** create `services/qa/tools/` package or per-tool files unless the single file exceeds
1000 lines.

---

## Module API (public surface)

```python
# apps/engine/src/services/qa/tools.py

TOOL_DEFINITIONS: list[dict]  # OpenAI function schemas for planner

def execute_tool(
    session: Session,
    settings: Settings,
    *,
    project_id: uuid.UUID,
    tool_name: str,
    args: dict[str, Any],
    repo_ids: list[uuid.UUID] | None,
) -> QaToolResult: ...

def tool_definitions_for_planner() -> list[dict[str, Any]]: ...
```

**`QaToolResult`** (dataclass or TypedDict):

- `tool_name`, `args`, `hits: list[QaToolHit]`, `truncated: bool`, `duration_ms: float`
- Each `QaToolHit`: `chunk_id`, `repo_id`, `file_path`, `span`, `excerpt`, `scores` dict,
  `graph_node_id` optional, fields needed to build `RetrievalMatch` for confidence

---

## Tool implementations

| Tool | Implementation notes |
|---|---|
| `search_symbols` | `symbol_search(session, terms=[args["query"]], limit=QA_AGENT_MAX_TOOL_HITS, ...)` |
| `search_code` | `keyword_search` with `extract_search_terms(args["query"])` |
| `search_vectors` | `EmbeddingClient.embed_texts([query])` + `similarity_search` |
| `search_hybrid` | Inline: parallel three legs + `reciprocal_rank_fusion` + `classify_query_intent` + `resolve_top_k` — **do not call** `retrieve_code_chunks()` |
| `graph_expand` | `expand_graph_neighbors` from `node_id` arg; map nodes → chunks like `graph_expand.py`. **Always available** — do **not** check `retrieval_graph_enabled` (removed in plan 02). Respect `RETRIEVAL_GRAPH_MAX_DEPTH` / `RETRIEVAL_GRAPH_MAX_EXTRA_CHUNKS` only. |
| `read_symbol` | Parse `qualified_name` per plan 01; lookup graph node → best overlapping chunk |
| `read_chunk` | `CodeChunkRepository.get_by_id` scoped to project + active status |

**Excerpt building:** truncate chunk `content` with `truncate_to_tokens(..., QA_AGENT_MAX_EXCERPT_TOKENS)`.

**Project guard:** every query filters `status = 'A'` and `project_id`.

---

## `search_hybrid` detail (lives inside `tools.py`)

Copy the fusion logic from `search.py` lines 66–112 **without**:

- `augment_matches_with_graph` (automatic)
- `rerank_matches`
- `prune_matches`

Return top `QA_AGENT_MAX_TOOL_HITS` fused matches as `QaToolHit` list.

---

## `TOOL_DEFINITIONS` schemas

One JSON schema per tool for OpenAI-compatible `tools` parameter. Required parameters only:

| Tool | Parameters |
|---|---|
| `search_symbols` | `query: string` |
| `search_code` | `query: string` |
| `search_vectors` | `query: string` |
| `search_hybrid` | `query: string` |
| `graph_expand` | `node_id: string (uuid)` |
| `read_symbol` | `qualified_name: string` |
| `read_chunk` | `chunk_id: string (uuid)` |

---

## Files **not** created

- `services/retrieval/tools.py` — use `services/qa/tools.py` only
- Separate `search_hybrid.py` — keep in `tools.py`

---

## Tests

**File:** `apps/engine/tests/services/test_qa_tools.py` (new)

Use existing DB fixtures pattern from `test_retrieval_search.py` / `test_graph_expand.py`.

| Test name | Behavior |
|---|---|
| `test_search_symbols_returns_hits_for_known_symbol` | Seed graph node + chunk |
| `test_search_hybrid_fuses_three_legs` | Mock or fixture DB |
| `test_graph_expand_respects_max_extra_chunks` | Settings cap |
| `test_read_symbol_qualified_name_with_file` | `path::symbol` format |
| `test_read_chunk_rejects_other_project` | Security scope |
| `test_execute_tool_unknown_name_raises` | ValueError |
| `test_tool_results_respect_max_hits` | len(hits) ≤ `QA_AGENT_MAX_TOOL_HITS` |
| `test_excerpt_truncation` | Long chunk content capped |

Coverage: **≥ 80%** line + branch on `tools.py`.

```bash
cd apps/engine && uv run pytest tests/services/test_qa_tools.py --cov=services/qa/tools --cov-branch --cov-fail-under=80
```

**No E2E.**

---

## Documentation

| Doc | Update |
|---|---|
| `apps/engine/README.md` | §QA tools table listing tool names + backend |
| `apps/engine/AGENTS.md` | Note: retrieval tools live in `services/qa/tools.py` |
| `apps/engine/TODO.md` | Mark QA tools done |

---

## Definition of Done

- [x] `services/qa/tools.py` implements all 7 tools + schemas
- [x] `test_qa_tools.py` ≥ 80% coverage on `tools.py`
- [x] No imports from deleted modules
- [x] `stream_answer.py` remained unchanged until plan 05

---

## Rollback

Delete `tools.py` and test file; no migration.
