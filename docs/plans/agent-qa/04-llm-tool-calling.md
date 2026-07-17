# Plan 04 — LLM tool calling (`vllm_client.py` extension)

**ADR:** [0026](../../adr/0026-agent-orchestrated-developer-qa.md)  
**Depends on:** [01](./01-contracts-and-codegen.md), [03](./03-qa-retrieval-tools.md)  
**Blocks:** plans 05–09  

---

## Goal

Add OpenAI-compatible **tool / function calling** to the existing LLM client. Extend
`apps/engine/src/services/llm/vllm_client.py` in place — **do not** add `tool_client.py` unless
`vllm_client.py` would exceed 1000 lines after edits.

---

## New functions (same file)

```python
def complete_with_tools(
    settings: Settings,
    messages: list[dict[str, str]],
    tools: list[dict[str, Any]],
    *,
    stats: LlmStreamStats | None = None,
) -> PlannerTurnResult: ...

def stream_final_answer(...) -> Iterator[str]:
    # existing stream_vllm_answer — rename or keep as wrapper
```

**`PlannerTurnResult`:**

- `tool_calls: list[ParsedToolCall]` — name + parsed JSON args (may be empty)
- `assistant_content: str | None` — raw assistant text if model spoke without tools
- `usage` — token counts when available

**`ParsedToolCall`:** `name: str`, `arguments: dict[str, Any]`, `id: str | None`

---

## Provider behavior

| Backend | Endpoint | Notes |
|---|---|---|
| vLLM OpenAI API | `POST {base}/chat/completions` with `tools`, `tool_choice: auto` | Primary |
| Ollama native | Detect via `_ollama_native_root`; use native API only if it supports tools; else OpenAI shim | Document supported models in engine README |

**Non-streaming** planner calls (`stream=False`) for deterministic JSON tool payloads.

If the model returns **no** `tool_calls` and no final-answer signal:

- Treat as social / clarification turn only when plan 05 social rules apply
- Otherwise return empty `tool_calls` and let agent loop continue or abstain

---

## Health check

**File:** `apps/engine/src/services/health/model_backends.py`

Add `check_planner_tool_support(settings)`:

- Sends minimal `tools` schema + user message to LLM
- **Pass:** HTTP 200 and response parses (tool_calls array or valid message)
- **Fail:** log warning at startup; `/health` detail includes `plannerTools: ok|unsupported`

Remove or repurpose `check_reranker_backend` in plan 06 — in plan 04 only **add** planner check.

---

## Prompts

**File:** `apps/engine/src/services/llm/prompts.py`

Add `AGENT_PLANNER_SYSTEM_PROMPT` constant:

- Lists available tools (by reference — schemas sent via API)
- Instructs: call tools to gather evidence; do not answer code questions without tools
- Social turns: reply briefly without tools
- Do not invent file paths

Keep `CODE_QA_SYSTEM_PROMPT` for final answer step.

---

## Tests

**File:** `apps/engine/tests/services/test_vllm_tool_calling.py` (new)

| Test | Method |
|---|---|
| `test_parse_openai_tool_calls_from_response` | Unit — fixture JSON |
| `test_complete_with_tools_empty_when_no_base_url` | Uses excerpt/fallback path — must raise or return explicit error (no silent legacy QA) |
| `test_planner_health_check_skips_when_no_url` | Mock httpx |

Mock `httpx` — no live vLLM required in CI.

Extend `apps/engine/tests/services/test_model_backends.py` for planner probe.

```bash
cd apps/engine && uv run pytest tests/services/test_vllm_tool_calling.py tests/services/test_model_backends.py -q
```

**No E2E.**

---

## Documentation

| Doc | Update |
|---|---|
| `apps/engine/README.md` | §LLM — tool calling requirement; list CI-tested model ids when known |
| `apps/engine/.env.example` | No new keys unless `VLLM_SUPPORTS_TOOLS` needed — prefer health probe only |

---

## Definition of Done

- [x] `complete_with_tools` in `vllm_client.py` with docstrings
- [x] `AGENT_PLANNER_SYSTEM_PROMPT` in `prompts.py`
- [x] Health probe for tool support
- [x] Unit tests with mocked HTTP ≥ 80% on new functions in `vllm_client.py` (branch coverage on parse paths)
- [x] `stream_answer.py` remained unchanged until plan 05

---

## Open items (PR must state)

- Exact production model id(s) validated for tool calling — fill in README when benchmarked in plan 08/09.
