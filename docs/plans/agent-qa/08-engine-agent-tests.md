# Plan 08 — Engine agent tests & golden fixtures

**ADR:** [0026](../../adr/0026-agent-orchestrated-developer-qa.md)  
**Depends on:** [05](./05-agent-loop-and-stream-replace.md), [06](./06-legacy-retrieval-cleanup.md)  
**Blocks:** plan 09, plan 13  

---

## Goal

Consolidate **regression coverage** for agent QA: golden questions, cross-repo tool path, xlarge
tier config, and ≥ 80% coverage on `services/qa/*`.

---

## Golden fixture repo

**Directory:** `apps/engine/tests/fixtures/agent_qa_repo/`

Minimal TypeScript tree (committed, &lt; 50 files) containing:

| File | Purpose |
|---|---|
| `src/loan.utils.ts` | `getMinEmi`, `calculateEmi` — ADR 0020 EMI example |
| `src/api/loan.routes.ts` | Express route referencing service |
| `src/services/loan.service.ts` | `LoanService.doCalc` |

Index via test harness (in-memory or test DB seed script in fixture module) — **not** full git
clone in unit tests.

**File:** `apps/engine/tests/fixtures/agent_qa_seed.py`

- Inserts project, repo, chunks, graph_nodes, edges, embeddings (deterministic fake embeddings OK
  per existing test patterns)

---

## Golden question matrix

**File:** `apps/engine/tests/services/test_agent_qa_golden.py`

| ID | Question | Expected behavior |
|---|---|---|
| G1 | `what does getMinEmi do?` | Citations include `loan.utils.ts`; not abstain |
| G2 | `how is EMI calculated?` | ≥1 citation in loan files; confidence path exercised |
| G3 | `where is UserService defined?` | Symbol tool path (if in fixture, else skip with pytest mark) |
| G4 | `hello` | Short reply; no abstain; zero or no retrieval tools |
| G5 | `how does quantum_flux_capacitor work?` | Abstain after max iterations |
| G6 | Cross-repo (if fixture has http_call edge) | `graph_expand` adds backend file citation |

Use `@pytest.mark.integration` for tests needing DB + optional live LLM.

**CI default:** mock planner to scripted tool sequences for G1–G3; one optional nightly job with
live LLM if `AGENT_QA_LIVE_LLM=1`.

---

## Performance smoke (xlarge tier)

**File:** `apps/engine/tests/services/test_agent_qa_scale_config.py`

- Mock `count_active_by_project` returning 100_000 chunks
- Assert `resolve_top_k` returns xlarge row from plan 02
- No 5M LOC integration test in CI — document manual benchmark in README

---

## Coverage gate

```bash
cd apps/engine && uv run pytest \
  -o addopts="" \
  --cov=services.qa \
  --cov=services.llm.vllm_client \
  --cov-branch \
  --cov-report=term-missing \
  --cov-fail-under=80 \
  tests/services/test_agent_loop.py \
  tests/services/test_qa_tools.py \
  tests/services/test_agent_qa_golden.py \
  tests/services/test_vllm_tool_calling.py
```

---

## Documentation

| Doc | Update |
|---|---|
| `apps/engine/README.md` | §Testing — golden matrix G1–G6; `AGENT_QA_LIVE_LLM` env |
| `apps/engine/tests/fixtures/README.md` | **Create** — describe agent_qa_repo |

---

## Definition of Done

- [x] Fixture repo + seed helper committed
- [x] Golden tests G1–G5 pass with mocked planner
- [x] `services/qa` coverage ≥ 80% line + branch
- [x] xlarge tier config test passes
- [x] Document manual 5M LOC benchmark procedure (steps to run on large project — not automated)

---

## Manual 5M LOC benchmark (document only)

1. Index a project with ≥ 1M chunks (or extrapolate from 100k sample).
2. Run G2 question via `curl POST /engine/query`.
3. Record: p95 latency, iteration count, tool_call_count, abstain rate on 20-question sheet.
4. File results in `docs/plans/agent-qa/benchmark-results.md` (create when run — not in this plan PR).

**No E2E.**
