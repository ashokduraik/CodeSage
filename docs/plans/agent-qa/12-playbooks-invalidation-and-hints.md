# Plan 12 — Playbooks invalidation & warm-start

**ADR:** [0027](../../adr/0027-qa-investigation-playbooks.md)  
**Depends on:** [11](./11-playbooks-learning-service.md)  
**Blocks:** plan 13  

---

## Goal

Invalidate playbooks when index changes. Optional **warm-start** iteration 1 (default **off**).

---

## Invalidation hook

**File:** `apps/engine/src/services/qa/playbooks.py` — add:

```python
def invalidate_playbooks_for_files(session, *, project_id, file_paths: list[str]) -> int: ...
```

**Caller:** `apps/engine/src/services/embedding/run_embed.py` — after successful embed for a repo,
pass changed file paths from job payload to invalidation.

Logic:

- Soft-delete playbooks where `evidence_anchors` or `steps` reference any `file_path` in
  `file_paths` (JSONB containment query or fetch-and-filter in Python for v1 — document choice in PR)
- Return count invalidated for indexing log

---

## Anchor validation

```python
def validate_playbook_anchors(session, *, project_id, playbook) -> bool: ...
```

Before using a hint or warm-start:

- Each `file_path` in anchors must exist in active `code_chunks` for project
- Optional: `graph_node_id` exists in active `graph_nodes`

Skip invalid playbooks silently.

---

## Warm-start (feature flag)

**Constant:** `QA_PLAYBOOK_WARM_START_ENABLED` default **`false`** in `constants.py`

When `true` **and** best playbook similarity ≥ `QA_PLAYBOOK_WARM_START_SIMILARITY` (0.92)
**and** `validate_playbook_anchors`:

1. Execute `steps` via `execute_tool` with placeholder resolution (`{term:…}`, `{anchor:…}`)
2. Merge evidence; compute confidence
3. If ≥ `QA_AGENT_MIN_CONFIDENCE` → jump to final answer
4. Else planner from iteration 2

Placeholder rules in ADR 0027 — implement resolver in `playbooks.py` (same file).

---

## Tests

**File:** `apps/engine/tests/services/test_playbooks_invalidation.py`

| Test |
|---|
| `test_invalidate_soft_deletes_matching_file_path` |
| `test_validate_anchors_false_when_file_gone` |
| `test_warm_start_disabled_by_default` |
| `test_warm_start_runs_tools_when_enabled` |
| `test_warm_start_falls_through_to_planner_on_low_confidence` |

**File:** `apps/engine/tests/services/test_run_embed.py` — extend:

- Mock invalidation called with changed files list

---

## E2E (optional extension)

**File:** `tests/e2e/web/journey-developer-chat.spec.ts`

Add test 7 (skip if `E2E_PLAYBOOK_WARM_START` not set):

- Ask same question twice in two conversations
- Second answer latency &lt; first (flaky — mark `@slow` optional)

**Default DoD:** unit tests only; E2E extension optional in PR description.

---

## Documentation

| Doc | Update |
|---|---|
| `apps/engine/README.md` | Invalidation + warm-start flag |
| `docs/adr/0027-qa-investigation-playbooks.md` | Resolve open questions #2 #3 in PR text |

---

## Definition of Done

- [x] Embed hook calls invalidation
- [x] Anchor validation on hint + warm-start paths
- [x] Warm-start behind `QA_PLAYBOOK_WARM_START_ENABLED=false`
- [x] Tests pass
- [x] No dead code paths from warm-start when disabled

---

## Cleanup

Grep for TODO/FIXME left in playbooks code — none allowed at merge.
