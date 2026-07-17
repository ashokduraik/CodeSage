# Plan 11 — Playbooks learning service

**ADR:** [0027](../../adr/0027-qa-investigation-playbooks.md)  
**Depends on:** [10](./10-playbooks-schema-migration.md)  
**Blocks:** plan 12  

---

## Goal

Promote successful investigation traces to `qa_playbooks`. Retrieve similar playbooks for a new
question. **One module:** `apps/engine/src/services/qa/playbooks.py`.

---

## Module API

```python
def promote_trace_to_playbook(session, settings, *, project_id, trace, message_id, user_id) -> uuid.UUID | None: ...

def find_similar_playbooks(session, settings, *, project_id, question: str, limit: int = 3) -> list[PlaybookHint]: ...

def format_playbook_hints_for_planner(hints: list[PlaybookHint]) -> str: ...
```

**Promotion rules L1–L5** from ADR 0027 — implement as explicit guard function
`is_trace_promotable(trace, message_meta) -> bool`.

**Merge:** when similarity ≥ `QA_PLAYBOOK_MERGE_SIMILARITY` (constant in `constants.py`, default
`0.95`), increment `success_count` instead of insert.

**Cap:** when `count_active >= QA_PLAYBOOK_MAX_PER_PROJECT` (500), soft-delete lowest
`success_count` / oldest `last_success_at` before insert.

---

## Constants (`constants.py`)

All of these live in `apps/engine/src/config/constants.py`. **Do not** add them to `.env` /
`.env.example` (engine tuning defaults — see `engine-config.mdc`).

| Constant | Default | Purpose |
|---|---|---|
| `QA_PLAYBOOK_MAX_PER_PROJECT` | `500` | Hard cap on active playbooks per project |
| `QA_PLAYBOOK_MIN_SIMILARITY` | `0.85` | Minimum cosine similarity for hint retrieval |
| `QA_PLAYBOOK_MERGE_SIMILARITY` | `0.95` | Merge into existing playbook vs insert new row |
| `QA_PLAYBOOK_LEARNING_ENABLED` | `true` | Kill-switch for promote + hint lookup (code constant only) |

---

## Invocation point

**Option A (chosen):** synchronous after successful answer in `agent_loop.py` before `done` chunk.

- Wrap in try/except — promotion failure must not break answer stream
- Log at WARNING

**Option B (deferred):** `playbook_promote` job — document in ADR open question if sync too slow.

---

## Planner integration (hints only)

In `agent_loop.py` iteration 1 **before** planner call:

```python
hints = find_similar_playbooks(...)
planner_messages = [system + format_playbook_hints_for_planner(hints) + ...]
```

**Do not** auto-execute playbook tools in this plan (warm-start = plan 12).

---

## Tests

**File:** `apps/engine/tests/services/test_playbooks.py`

| Test |
|---|
| `test_promote_rejects_abstain_trace` |
| `test_promote_rejects_no_tools` |
| `test_merge_increments_success_count` |
| `test_cap_evicts_oldest_low_success` |
| `test_find_similar_above_threshold` |
| `test_find_similar_empty_below_threshold` |
| `test_format_hints_includes_steps` |

Coverage ≥ 80% on `playbooks.py`.

```bash
cd apps/engine && uv run pytest tests/services/test_playbooks.py --override-ini="addopts=" --cov=services.qa.playbooks --cov-branch --cov-fail-under=80
```

---

## Documentation

| Doc | Update |
|---|---|
| `apps/engine/README.md` | §Playbooks — promotion rules summary |
| `apps/engine/TODO.md` | Playbooks learning |

---

## Definition of Done

- [x] `playbooks.py` implements promote + find + format
- [x] Agent loop calls find hints iteration 1; promote after success
- [x] Tests ≥ 80% on playbooks module
- [x] `QA_PLAYBOOK_WARM_START_ENABLED` **not** added yet

---

## E2E

Optional manual: ask same question twice; second request logs show hint injection (debug). Formal
E2E in plan 12 if warm-start added.
