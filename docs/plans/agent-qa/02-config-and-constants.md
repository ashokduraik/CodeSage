# Plan 02 — Config & constants (agent QA tuning)

**ADR:** [0026](../../adr/0026-agent-orchestrated-developer-qa.md)  
**Depends on:** [01](./01-contracts-and-codegen.md)  
**Blocks:** plans 03–09  

---

## Goal

Add agent-loop tuning defaults to `constants.py` / `Settings`. Remove obsolete **feature toggles**
from `.env.example`: pipeline reranker keys (implementation deleted in plan 06) and
`RETRIEVAL_GRAPH_ENABLED` (graph expand becomes an always-available tool — no global kill-switch).

**Keep** in `.env.example`: `LLM_CONTEXT_DETECT_ENABLED`, `FRESHNESS_POLL_ENABLED`.

---

## Files to change

| File | Action |
|---|---|
| `apps/engine/src/config/constants.py` | Add `QA_AGENT_*`, xlarge tier |
| `apps/engine/src/config/__init__.py` | Wire `Settings` fields (defaults from constants); remove `retrieval_graph_enabled` |
| `apps/engine/.env.example` | Remove `RETRIEVAL_RERANKER_*` and `RETRIEVAL_GRAPH_ENABLED` |
| `apps/engine/.env` | Mirror `.env.example` removals/additions per `env-example-sync.mdc` |
| `docs/adr/0022-rag-config-constants.md` | Footnote: agent knobs in constants; reranker + graph toggle removed from `.env.example` |

---

## New constants (`constants.py`)

| Constant | Default | Purpose |
|---|---|---|
| `QA_AGENT_MAX_ITERATIONS` | `5` | Max planner loops |
| `QA_AGENT_MIN_CONFIDENCE` | `0.8` | Evidence gate before final answer |
| `QA_AGENT_CONFIDENCE_TOP_N` | `10` | Matches scored for confidence |
| `QA_AGENT_MAX_POOL_CHUNKS` | `20` | Evidence pool hard cap |
| `QA_AGENT_MAX_TOOL_HITS` | `8` | Max hits per tool response |
| `QA_AGENT_MAX_EXCERPT_TOKENS` | `512` | Per-hit excerpt in tool JSON |
| `QA_AGENT_PLANNER_TIMEOUT_SECONDS` | `60.0` | Per planner LLM call |
| `QA_AGENT_FINAL_TIMEOUT_SECONDS` | `300.0` | Final answer stream (reuse `LLM_TIMEOUT_SECONDS` if equal) |
| `RETRIEVAL_ADAPTIVE_XLARGE_MIN_CHUNKS` | `100000` | xlarge tier lower bound |
| `RETRIEVAL_VECTOR_TOP_K_XLARGE` | `20` | Vector leg cap at xlarge |
| `RETRIEVAL_KEYWORD_TOP_K_XLARGE` | `12` | Keyword leg cap at xlarge |
| `RETRIEVAL_SYMBOL_TOP_K_XLARGE` | `5` | Symbol leg cap at xlarge |

Add `Settings` fields for each (env-overridable, **not** in `.env.example` per ADR 0022).

---

## Constants to deprecate (QA path)

| Constant | Action in plan 02 |
|---|---|
| `RETRIEVAL_MIN_CONFIDENCE` | Keep in `constants.py` until plan 06 removes usages; add comment `deprecated — use QA_AGENT_MIN_CONFIDENCE` |

Do **not** delete `RETRIEVAL_MIN_CONFIDENCE` until plan 06 removes `is_confident_match`.

---

## Remove from `.env.example`

Delete these keys (and mirror delete in `apps/engine/.env` without touching secrets):

- `RETRIEVAL_RERANKER_ENABLED`
- `RETRIEVAL_RERANKER_BASE_URL`
- `RETRIEVAL_RERANKER_MODEL`
- `RETRIEVAL_GRAPH_ENABLED`

Reranker implementation files deleted in plan 06. Graph expand is always available via the
`graph_expand` tool (plan 03); depth/extra-chunk caps stay in `constants.py` as
`RETRIEVAL_GRAPH_MAX_DEPTH` / `RETRIEVAL_GRAPH_MAX_EXTRA_CHUNKS` — **not** as an env toggle.

### Settings / wiring for graph toggle (plan 02)

| Item | Action |
|---|---|
| `Settings.retrieval_graph_enabled` | **Remove** from `config/__init__.py` |
| `graph_expand.py` early return on `not settings.retrieval_graph_enabled` | **Remove** in plan 02 if still present (safe: auto-expand path still gated until plan 05; tool path must never check this flag) |
| `tests/services/test_graph_expand.py` | Delete `test_augment_matches_with_graph_disabled` (or rewrite — no disable path) |
| Root / compose env that sets `RETRIEVAL_GRAPH_ENABLED` | Remove if present (`docker-compose*.yml`, root `.env.example`) |

**Keep** tuning constants (not env toggles):

- `RETRIEVAL_GRAPH_MAX_DEPTH`
- `RETRIEVAL_GRAPH_MAX_EXTRA_CHUNKS`

---

## Adaptive top-k (xlarge tier)

**File:** `apps/engine/src/services/retrieval/adaptive_top_k.py`

Extend `ProjectSizeTier` enum with `XLARGE`.

| Tier | Condition (active chunks in project) |
|---|---|
| SMALL | &lt; `RETRIEVAL_ADAPTIVE_MEDIUM_MIN_CHUNKS` |
| MEDIUM | medium min ≤ count &lt; large min |
| LARGE | large min ≤ count &lt; xlarge min |
| XLARGE | count ≥ `RETRIEVAL_ADAPTIVE_XLARGE_MIN_CHUNKS` |

`resolve_top_k()` returns xlarge row from table above.

---

## Tests

| File | Cases |
|---|---|
| `apps/engine/tests/services/test_adaptive_top_k.py` | xlarge boundary at 100k chunks; top-k values |
| `apps/engine/tests/config/test_settings.py` (create if missing) | `QA_AGENT_*` defaults load from constants |

Run:

```bash
cd apps/engine && uv run pytest tests/services/test_adaptive_top_k.py -q
```

**No E2E.**

---

## Documentation

| Doc | Update |
|---|---|
| `apps/engine/README.md` | Replace reranker / graph toggle rows with `QA_AGENT_*` constants table; note graph expand is tool-only |
| `apps/engine/TODO.md` | Add checklist item for agent config (mark done in plan 02 PR) |
| `docs/plans/phase-1-mvp-code-qa.md` | Footnote: M3.3 reranker superseded by ADR 0026 plan 06 |
| `docs/adr/0023-cross-repo-linking.md` | Note: `RETRIEVAL_GRAPH_ENABLED` removed; expand is agent tool (ADR 0026) |

---

## Definition of Done

- [ ] All `QA_AGENT_*` and xlarge constants in `constants.py` with one-line comments
- [ ] `Settings` exposes fields; no inline magic numbers
- [ ] `.env.example` / `.env` reranker keys **and** `RETRIEVAL_GRAPH_ENABLED` removed
- [ ] `Settings.retrieval_graph_enabled` gone; no `RETRIEVAL_GRAPH_ENABLED` in compose/env examples
- [ ] Graph expand no longer gated by a boolean flag (depth/extra caps remain)
- [ ] xlarge tier in `adaptive_top_k.py` + tests green
- [ ] Engine still uses **legacy** `stream_answer` (behavior unchanged) until plan 05
- [ ] `rg RETRIEVAL_GRAPH_ENABLED` on repo is empty (docs may mention removal until plan 13)

---

## Open items (document in PR if unresolved)

- Benchmark to confirm `RETRIEVAL_VECTOR_TOP_K_XLARGE = 20` is sufficient at 125k chunks — adjust
  after plan 08 golden set if p95 vector query &gt; 500ms.
