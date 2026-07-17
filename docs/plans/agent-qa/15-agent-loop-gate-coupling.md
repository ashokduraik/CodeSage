# Plan 15 — Agent loop gate coupling & honest abstain

**ADR:** [0026](../../adr/0026-agent-orchestrated-developer-qa.md) (orchestration fix; **no new ADR**)  
**Depends on:** [14](./14-span-aware-path-evidence.md) (preferred; can start in parallel if needed)  
**Blocks:** [16](./16-evidence-confidence-accuracy.md) goldens that assume continue-to-answer  
**Status:** Planned  
**Goal theme:** Stop burning iterations on empty planner turns while evidence exists but confidence
&lt; threshold; stop telling users “no evidence” when citations were streamed.

---

## Problem (observed)

1. After 2 tool iterations, confidence still failed the 0.8 gate.
2. Planner returned **no further tool_calls** on later iterations.
3. Loop code path:

```python
if not turn.tool_calls:
    iteration_records.append(...)
    continue  # does not re-gather; does not re-score meaningfully
```

4. Remaining iterations (up to `QA_AGENT_MAX_ITERATIONS`) idle → generic abstain:

> I couldn't find enough evidence in the indexed repository to answer confidently.

…even though `getEMIAmount` citations were already in the SSE stream.

ADR 0026 promise: low confidence should trigger **another** evidence-gathering turn, not silent stop.

---

## Goal

1. When the gate fails and the pool is **non-empty**, do not accept idle “done gathering” turns —
   nudge the planner to call another tool (with concrete anchors).
2. When abstaining, use **honest** copy based on pool state.
3. Keep social turn exception and empty-pool abstain behavior.
4. Do **not** let empty tool_calls bypass the confidence gate (already true) — make that explicit
   in code comments and tests.

---

## Out of scope

- Changing hybrid confidence formula / threshold (plan 16).
- Span windowing (plan 14).
- New SSE chunk `type` for abstain reasons (reuse `abstain.content` string unless contract change
  is justified — **prefer no contract change**).
- LLM self-reported confidence.

---

## Code changes

### 1. Detect idle failed-gate turns — `apps/engine/src/services/qa/agent_loop.py`

After `complete_with_tools`, when `not turn.tool_calls`:

| Condition | Action |
|---|---|
| `iteration == 1` and social | Unchanged — short reply + `done` |
| Pool empty | Record iteration; `continue` (or early break to abstain after 2 consecutive empties — see below) |
| Pool non-empty and last gate failed (or never passed) | **Do not** treat as success. Append a **user/system nudge** message and **retry planner once** in the same iteration **or** force a synthetic “continue” by appending tool-result-style guidance and looping without consuming an extra empty count carelessly |

**Recommended control flow (clear, testable):**

```text
on empty tool_calls:
  if social on iter 1: ... return
  if pool empty:
    consecutive_empty += 1
    if consecutive_empty >= 2: break to abstain (empty)
    continue
  # pool has evidence, gate not passed
  if not already_nudged_this_streak:
    append planner message with evidence summary + confidence
    already_nudged_this_streak = True
    # re-call complete_with_tools once without incrementing iteration
    # OR increment iteration but require tools — prefer: same iteration re-prompt once
  else:
    consecutive_empty += 1
    continue  # already nudged; still no tools → burn iteration
```

**Nudge content** (deterministic string builder, not LLM-authored):

- Current `last_confidence` and `qa_agent_min_confidence`
- Top 3 pool anchors: `filePath`, `span`, `chunkId`
- Instruction: call `read_chunk` / `read_symbol` / `read_chunks_for_path` with `around_line` or
  `chunk_id`, or a more specific search; do not answer in text

Implement as `_planner_evidence_nudge(pool, confidence, min_confidence) -> str`.

**Cap:** at most **one** nudge re-call per iteration to avoid infinite planner loops inside one
iteration. Wall clock still bounded by `QA_AGENT_MAX_ITERATIONS` outer loop.

### 2. Early exit for hopeless empty gathers (optional but recommended)

If pool stays empty for **2 consecutive** iterations with no tools (or tools returning 0 hits),
break early to abstain — saves latency vs always running 5 idle turns.

Keep max-iteration abstain when pool has hits but gate never passes.

### 3. Honest abstain messages

Replace single string with a small helper:

```python
def _abstain_content(*, pool_size: int, last_confidence: float, min_confidence: float) -> str:
    ...
```

| Case | Message (exact copy for tests) |
|---|---|
| `pool_size == 0` | Keep current: `I couldn't find enough evidence in the indexed repository to answer confidently.` |
| `pool_size > 0` | `I found related code in the index, but the evidence was not strong enough to answer confidently.` |

Do **not** invent file lists in the abstain string in v1 (citations already streamed). Optional
later: append top file paths — only if product asks.

Log line already includes confidence — keep / enhance:

```text
Agent abstain after N iterations (confidence=…, tools=…, pool=…)
```

### 4. Investigation trace

When recording iterations with empty tool_calls after a nudge, set something auditable in the
iteration record, e.g. `"nudge": true` or `"toolCalls": [{"tool": "_evidence_nudge", ...}]`
— prefer a boolean `nudged: true` on the iteration dict to avoid fake tool names in playbook
learning. Confirm plan 11 promotion ignores unknown fields (it should).

### 5. Prompt (light)

In `AGENT_PLANNER_SYSTEM_PROMPT`, add one sentence:

- If prior tool results exist but you have not finished investigating, **call another tool**;
  do not stop with empty tool_calls while formula/implementation questions remain unanswered.

Do not instruct the planner to emit a final code answer (still forbidden).

---

## Removal / cleanup

| Remove | Why |
|---|---|
| Single hard-coded abstain string inline at end of loop | Replace with `_abstain_content` |
| Dead comments implying “planner stop ⇒ done” | Misleading vs gate |

Grep:

```bash
rg "couldn't find enough evidence" apps/engine
```

Should hit helper + tests only (one source of truth for empty-pool copy).

---

## Doc changes

| File | Change |
|---|---|
| `docs/plans/agent-qa/README.md` | Register plan 15 |
| `apps/engine/TODO.md` | Checkbox: gate coupling + honest abstain |
| `apps/engine/README.md` | Note: abstain text differs when citations existed; loop nudges planner when gate fails |
| `docs/plans/agent-qa/05-agent-loop-and-stream-replace.md` | Footnote: idle empty tool_calls behavior superseded by plan 15 |
| ADR 0026 | **No rewrite.** Behavior remains “gate owns answer”; this restores “iterate when below threshold” |

**No contract / OpenAPI change** unless product wants structured `abstainReason` — defer.

---

## Tests

### `apps/engine/tests/services/test_agent_loop.py`

| Test | Setup / expect |
|---|---|
| `test_abstains_after_max_iterations_no_evidence` | Keep — empty pool; **empty-pool** abstain string |
| `test_abstain_message_when_pool_has_hits_but_gate_fails` | Script tools that add hits; mock confidence always fail; planner then empty tools → abstain content is the **related code** variant |
| `test_nudge_reprompts_planner_when_gate_fails_with_pool` | Iter1: tools+hits, gate fail; Iter2: empty tools once → nudge → second planner call in streak receives messages containing confidence / filePath; if second returns tools, execute them |
| `test_social_turn_without_tools` | Unchanged — must not nudge |
| `test_empty_pool_two_idle_turns_early_abstain` | If early-exit implemented — assert iterations &lt; max |
| `test_answers_when_confidence_reaches_threshold` | Unchanged — no nudge path |

Mock `evaluate_evidence_confidence` where useful so tests do not depend on hybrid math.

### Playbook tests

Ensure promote still rejects abstain; nudge fields do not break `is_trace_promotable`.

### Coverage

New branches in `agent_loop.py` ≥ 80% line+branch for nudge / abstain helper.

---

## Definition of Done

- [ ] Empty tool_calls with non-empty pool + failed gate → evidence nudge (≤1 re-call / iteration).
- [ ] Distinct abstain copy for empty vs non-empty pool.
- [ ] Social path unchanged.
- [ ] Tests above green; playbooks still ignore abstains.
- [ ] Docs/TODO/README updated; **no new ADR**; **no contracts change** unless explicitly approved.
- [ ] Manual: EMI-like scripted run with gate fail then successful follow-up tool after nudge (unit-level).

---

## Pitfalls

- Do not infinite-loop `complete_with_tools` inside one iteration — hard cap 1 nudge re-call.
- Do not stream `token` from planner nudge content.
- Do not lower the confidence threshold here.
- Warm-start path: if warm-start fails gate and falls through to planner, nudge rules still apply.
