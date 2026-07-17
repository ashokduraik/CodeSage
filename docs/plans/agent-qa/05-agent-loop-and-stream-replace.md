# Plan 05 — Agent loop & replace `stream_answer` path

**ADR:** [0026](../../adr/0026-agent-orchestrated-developer-qa.md)  
**Depends on:** [03](./03-qa-retrieval-tools.md), [04](./04-llm-tool-calling.md)  
**Blocks:** plans 06–09, 10–12  

---

## Goal

Implement the agent loop in **one module** `apps/engine/src/services/qa/agent_loop.py`. Make
`stream_answer.py` a thin wrapper. **Delete** small-talk bypass code.

---

## Files

| File | Action |
|---|---|
| `apps/engine/src/services/qa/agent_loop.py` | **Create** — loop, evidence pool, confidence, SSE |
| `apps/engine/src/services/qa/stream_answer.py` | **Slim** — delegate to `agent_loop.stream_agent_answer` |
| `apps/engine/src/services/router/small_talk.py` | **Delete** |
| `apps/engine/tests/services/test_small_talk.py` | **Delete** |
| `apps/engine/tests/services/test_agent_loop.py` | **Create** |
| `apps/engine/tests/services/test_stream_answer.py` | **Rewrite** mocks to target agent_loop |

---

## `agent_loop.py` responsibilities (single file)

1. **Evidence pool** — merge `QaToolHit` → dedupe by `chunk_id`, cap `QA_AGENT_MAX_POOL_CHUNKS`
2. **Confidence** — after each iteration: `hits_to_retrieval_matches(pool)` →
   `compute_hybrid_confidence` + `has_hard_vector_fail` gate per ADR 0026
3. **Iteration loop** — `for i in 1..QA_AGENT_MAX_ITERATIONS`
4. **Planner** — `complete_with_tools` with history of tool results as assistant/tool messages
5. **Tool execution** — `execute_tool` from `tools.py`; emit SSE `tool_start` / `tool_result`
6. **Citations** — emit `citation` SSE when new chunk enters pool
7. **Final answer** — when confidence ≥ threshold: `stream_vllm_answer` with pool excerpts only
8. **Abstain** — after max iterations below threshold
9. **Social** — if iteration 1 planner returns no tool_calls and message matches social heuristic
   (inline regex set in `agent_loop.py` — **do not** reintroduce `small_talk.py` module): stream
   short reply, `done`, return
10. **End-user audience** — keep `is_code_audience` check in `stream_answer.py` before agent loop

> **Superseded by [plan 15](./15-agent-loop-gate-coupling.md):** the original item 8/9 behavior of
> silently accepting an idle empty-`tool_calls` turn (record iteration + `continue`) is replaced.
> When the gate fails but the pool is non-empty, the loop now nudges the planner (≤1 re-call per
> iteration) to call another tool, and the abstain copy is honest about pool state (empty vs
> related-code-found). The social exception in item 9 is unchanged.

**Target size:** &lt; 1000 lines; do not split unless exceeded.

---

## `stream_answer.py` after change

```python
def stream_engine_answer(...):
    if generate_title: ...
    if not is_code_audience(audience): yield abstain; return
    yield from stream_agent_answer(settings, session_factory, ...)
```

Remove imports: `retrieve_code_chunks`, `is_confident_match`, `small_talk`, `_pack_context` usage,
`_stream_small_talk_answer`.

---

## SSE events (order)

Typical successful flow:

1. `tool_start` / `tool_result` (per tool)
2. `citation` (per new evidence chunk)
3. repeat until confidence ≥ 0.8
4. `token` × N
5. `metrics` (include `agentIterations`, `evidenceConfidence`, `toolCallCount`)
6. `done`

Abstain: `abstain` → `done` (no `metrics` required on abstain — match current behavior).

---

## Investigation trace (in-memory)

Build `InvestigationTrace` dict during loop; attach to metrics or hold for plan 07 Node persistence.
Do not require DB column until plan 10 — pass via optional field on last internal struct.

---

## Delete small talk (mandatory)

| Remove | Reason |
|---|---|
| `services/router/small_talk.py` | ADR 0026 — single path |
| `tests/services/test_small_talk.py` | Module deleted |
| `_stream_small_talk_answer` in stream_answer | Deleted |
| `test_stream_small_talk_skips_retrieval_and_llm` | Replace with agent social test in `test_agent_loop.py` |

Grep repo after PR:

```bash
rg small_talk apps/engine
```

Must return **no matches**.

---

## Tests

### `test_agent_loop.py`

| Test | Setup |
|---|---|
| `test_abstains_after_max_iterations_no_evidence` | Mock planner returns empty tools |
| `test_answers_when_confidence_reaches_threshold` | Mock tools return strong symbol hit |
| `test_emits_tool_and_citation_events` | Parse SSE types |
| `test_social_turn_without_tools` | Planner returns greeting text, no tools |
| `test_final_prompt_only_includes_pool_excerpts` | Mock LLM capture messages |
| `test_end_user_not_handled_here` | N/A — stays in stream_answer test |

Mock `complete_with_tools` and `execute_tool` — no live LLM/DB for most tests.

### `test_stream_answer.py`

- Remove all `retrieve_code_chunks` / `is_confident_match` monkeypatches
- Patch `stream_agent_answer` or agent_loop internals
- Keep: end_user abstain, title generation, metrics shape

Coverage: **≥ 80%** on `agent_loop.py` + updated `stream_answer.py`.

```bash
cd apps/engine && uv run pytest tests/services/test_agent_loop.py tests/services/test_stream_answer.py --cov=services/qa --cov-branch --cov-fail-under=80
```

**No E2E yet** — plan 09.

---

## Documentation

| Doc | Update |
|---|---|
| `apps/engine/README.md` | Replace §QA pipeline diagram with agent loop |
| `apps/engine/TODO.md` | Agent loop done; remove small-talk mention |
| `docs/README.md` | Status line: agent loop implemented (after merge) |

---

## Definition of Done

- [x] `agent_loop.py` implements full loop per ADR 0026
- [x] `small_talk.py` and tests **deleted**; runtime source is clean
- [x] `stream_answer.py` delegates; no `retrieve_code_chunks` import
- [x] Unit tests ≥ 80% on `services/qa/`
- [x] `POST /engine/query` uses the agent path; developer-chat E2E covers cited answers

---

## Not in this plan

- Deleting `retrieve_code_chunks` / reranker (plan 06)
- Node/web changes (plan 07)
- E2E (plan 09)
