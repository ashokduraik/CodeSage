# Plan 14 — Span-aware path evidence (`read_chunks_for_path`)

**ADR:** [0026](../../adr/0026-agent-orchestrated-developer-qa.md) (implementation fix; **no new ADR**)  
**Depends on:** plans 03, 05, 08 (Complete)  
**Blocks:** [15](./15-agent-loop-gate-coupling.md), [16](./16-evidence-confidence-accuracy.md)  
**Status:** Complete  
**Goal theme:** Fix false abstains / weak answers when hybrid already found the right file but
path drill-down returned the wrong end of a large file (EMI `getEMIAmount` ~L361 missed).

---

## Problem (observed)

1. `search_hybrid` returned `loan.utils.ts` spans around `getEMIAmount` (formula present).
2. Planner called `read_chunks_for_path(path=src/app/services/loan.utils.ts)`.
3. Tool returned **first** `QA_AGENT_MAX_TOOL_HITS` (8) chunks in span order → start of file only.
4. Result was `truncated: true`; formula region never entered the deeper evidence set.
5. Path hits scored `{"path": 1.0}` → synthetic fused ≈ `0.01` (useless for the gate).

ADR 0026 §Tools: path read should return active chunks for that path **merged in span order,
with a strict token cap** — not a blind first-N that drops the answer region.

---

## Goal

Make path drill-down **reach the relevant region** of large files, prefer chunks near prior
evidence spans, and stop inventing a useless `path: 1.0` score (real scoring lands in plan 16;
this plan at least stops pretending path=1.0 is a retrieval leg).

---

## Out of scope (this plan)

- Changing `QA_AGENT_MIN_CONFIDENCE` or `compute_hybrid_confidence` formula (plan 16).
- Forced planner continue when gate fails (plan 15).
- New ADR / gate bypass heuristics.
- `read_file` from git worktree (still forbidden per ADR 0020/0026).

---

## Code changes

### 1. Extend `read_chunks_for_path` tool schema — `apps/engine/src/services/qa/tools.py`

**`TOOL_DEFINITIONS` entry** — add optional args (all optional; backward compatible):

| Arg | Type | Meaning |
|---|---|---|
| `path` | string | **Required** (unchanged) |
| `around_line` | integer | Prefer chunks whose span overlaps / is nearest this 1-based line |
| `start_line` | integer | Prefer chunks with `span.startLine >= start_line` (window start) |
| `chunk_id` | string (uuid) | If set, center the window on that chunk’s span (then expand neighbors) |

Update the tool `description` so the planner knows:

- After hybrid/search citations, pass `around_line` from the citation span (or `chunk_id`).
- Do not assume the first page of a large file contains the answer.

### 2. Implement windowed selection — `_read_chunks_for_path`

**Current behavior to replace:**

```python
hits = [
    _hit_from_chunk(chunk, settings, scores={"path": 1.0})
    for chunk in chunks[: max_hits + 1]
]
```

**New algorithm** (keep listing via `CodeChunkRepository.list_active_by_project_path`):

1. Load **all** active chunks for the resolved path(s), span-ordered (same repo query as today).
2. If the list length ≤ `qa_agent_max_tool_hits`: return all (truncated=false).
3. Else select a **window** of size `qa_agent_max_tool_hits`:
   - If `chunk_id` present and found in list → center window on that index.
   - Else if `around_line` or `start_line` present → choose window minimizing distance from
     chunk mid-span (or start) to the target line.
   - Else **default (no anchor):** still return first N (document this), but set
     `truncated=true` and include in tool JSON a hint: `"hint": "pass around_line or chunk_id
     to load another region"`.
4. Always set `truncated = len(all_chunks) > len(returned)`.
5. When truncated and an anchor was used, optionally include 1–2 boundary chunks outside the
   window only if they fit under max hits by shrinking the center symmetrically — **do not**
   exceed `qa_agent_max_tool_hits`.

**Scores (this plan):** stop emitting `{"path": 1.0}`. Use empty scores `{}` or
`{"path_window": 1.0}` only as a non-leg marker that **must not** be mapped to
symbol/keyword/vector/fused in `hits_to_retrieval_matches` (plan 16 assigns real scores).
Until plan 16, empty scores → synthetic fused `0.01` (unchanged math); the accuracy win here is
**getting the right excerpts into the pool and final prompt**, not the gate number.

### 3. Planner prompt — `apps/engine/src/services/llm/prompts.py`

Update `AGENT_PLANNER_SYSTEM_PROMPT` (formula / calculation section):

- After `search_hybrid` / search hits that name a file + span, prefer
  `read_chunk(chunk_id)` **or** `read_chunks_for_path` with `around_line` / `chunk_id` from that hit.
- Explicitly: do not call `read_chunks_for_path` with only `path` on large files when a span is
  already known.

Keep prompt under maintainable length; do not duplicate full tool schemas.

### 4. Tool result payload for planner — `_tool_result_content` in `agent_loop.py` (light touch)

When serializing hits for the planner, ensure `span.startLine` / `endLine` remain present (already
true). Optionally add top-level:

```json
{ "truncated": true, "pathHint": "Use around_line or chunk_id to load another region of this file." }
```

only when `tool_name == "read_chunks_for_path"` and `truncated` — implement in
`_tool_result_content` or by extending `QaToolResult` with optional `meta: dict`. Prefer a small
`meta` on `QaToolResult` if it stays clean; otherwise encode hint inside the JSON content helper
in `tools.py` via a new optional field on `QaToolResult`.

**Avoid** bloating every tool result.

### 5. Constants (optional)

**File:** `apps/engine/src/config/constants.py`

Only if needed:

| Constant | Default | Purpose |
|---|---|---|
| `QA_AGENT_PATH_WINDOW_RADIUS` | derived from max hits | Document window sizing; prefer computing `max_hits // 2` inline — **do not** add a constant unless tests need it |

Prefer **no new env keys** in `.env.example` (tuning stays in constants per engine-config rule).

---

## Removal / cleanup (this plan)

| Remove / stop | Where | Why |
|---|---|---|
| `scores={"path": 1.0}` | `_read_chunks_for_path` | Fake retrieval leg; confuses future scoring |
| Any comment claiming path read returns “all chunks” without truncation | `tools.py` docstring | Lies vs `max_tool_hits` |

**Do not delete** `list_active_by_project_path` or the tool itself.

Grep after PR:

```bash
rg "path.: 1\.0|scores=\{\"path\"" apps/engine
```

Must return **no** production matches (tests may assert absence).

---

## Doc changes

| File | Change |
|---|---|
| `docs/plans/agent-qa/README.md` | Register plan 14 status + dependency |
| `apps/engine/TODO.md` | Checkbox: span-aware `read_chunks_for_path` |
| `apps/engine/README.md` | Short note under Agent QA tools: path read is windowed; pass `around_line` / `chunk_id` |
| `docs/adr/0026-agent-orchestrated-developer-qa.md` | **Do not rewrite.** Optional one-line in engine README pointing to ADR §Tools token-cap intent — **no new ADR** |
| `docs/plans/agent-qa/03-qa-retrieval-tools.md` | Add “Superseded behavior” note at top pointing to plan 14 for path-read windowing (keep historical plan intact) |

---

## Tests

### `apps/engine/tests/services/test_qa_tools.py`

| Test | Behavior |
|---|---|
| `test_read_chunks_for_path_returns_all_when_under_cap` | Existing — keep |
| `test_read_chunks_for_path_empty_when_file_missing` | Existing — keep |
| `test_read_chunks_for_path_window_around_line_includes_target_span` | Seed 20+ chunks on one path; `around_line` near late span → returned hits include that chunk; `truncated=true` |
| `test_read_chunks_for_path_window_by_chunk_id_centers` | Pass `chunk_id` of mid/late chunk → window contains it |
| `test_read_chunks_for_path_without_anchor_still_first_page` | No optional args → first N; truncated if oversized |
| `test_read_chunks_for_path_does_not_emit_path_1_score` | Assert `"path" not in hit.scores` or scores empty / non-leg only |
| `test_tool_definition_includes_around_line` | Schema properties contain `around_line`, `start_line`, `chunk_id` |

### `apps/engine/tests/services/test_prompts.py` (or new assertion)

| Test | Behavior |
|---|---|
| `test_planner_prompt_mentions_around_line_or_chunk_id_for_path` | `AGENT_PLANNER_SYSTEM_PROMPT` mentions `around_line` or `chunk_id` with path reads |

### Fixture seed (if needed)

Extend `apps/engine/tests/fixtures/agent_qa_seed.py` **only if** existing loan fixture lacks enough chunks to truncate — add multiple span windows on `loan.utils.ts` including a late `getEMIAmount`-like chunk. Prefer minimal addition; do not duplicate a second fixture tree.

### Coverage

Touched code in `tools.py` `_read_chunks_for_path` + helpers must stay ≥ 80% line+branch for the new branches (window selection, missing chunk_id, around_line vs default).

```bash
cd apps/engine && uv run pytest \
  tests/services/test_qa_tools.py \
  -k "read_chunks_for_path" \
  --cov=services.qa.tools --cov-branch --cov-fail-under=80
```

(Adjust fail-under to package-level gate used in CI if project already gates whole `services.qa`.)

---

## Definition of Done

- [x] Optional `around_line` / `start_line` / `chunk_id` on `read_chunks_for_path`; schema + docstring updated.
- [x] Large-file window includes target region when anchor provided; `truncated` accurate.
- [x] No `scores={"path": 1.0}` in production code.
- [x] Planner prompt steers toward span-aware drill-down.
- [x] Tests above green; no new ADR.
- [x] README / TODO / plan index updated.
- [ ] Manual sanity (optional): EMI-style question’s second tool call can load formula region when planner passes `around_line` from citation.

---

## Implementation notes / pitfalls

- Basename match may return **multiple** files — keep current multi-file order; apply windowing **per file** then merge, or window only when a single file resolves. Prefer: if multiple files match, return first page per file under a shared hit budget (document in docstring). Ask in PR description if ambiguous — default: window within each file_path group independently, round-robin until `max_hits`.
- Do not load git worktree content.
- Preserve soft-delete / `status='A'` / project scoping.
