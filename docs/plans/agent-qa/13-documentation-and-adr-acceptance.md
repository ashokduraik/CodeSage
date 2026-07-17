# Plan 13 — Documentation & ADR acceptance

**ADR:** [0026](../../adr/0026-agent-orchestrated-developer-qa.md), [0027](../../adr/0027-qa-investigation-playbooks.md)  
**Depends on:** plans 01–12 complete  
**Blocks:** nothing — final gate  

---

## Goal

Accept ADRs, sync all product docs, remove stale references to deleted pipeline, confirm CI green.

---

## ADR status

| ADR | Action |
|---|---|
| `docs/adr/0026-agent-orchestrated-developer-qa.md` | Set **Status: Accepted**; fill open questions table with resolutions from PRs |
| `docs/adr/0027-qa-investigation-playbooks.md` | Set **Status: Accepted**; fill open questions |
| `docs/adr/README.md` | Change Proposed → Accepted in index |

Add supersession notes to ADR 0020 / 0021 headers (orchestration superseded; retrievers kept).

---

## Documentation sweep

| Document | Required updates |
|---|---|
| `docs/README.md` | Implementation status — agent QA + playbooks **done** |
| `docs/final-solution.md` §8 | Replace fixed pipeline diagram with agent loop reference + link ADR 0026 |
| `docs/plans/phase-1-mvp-code-qa.md` | M3 agent path supersedes M3.2/M3.3 pipeline; link `agent-qa/` |
| `docs/architecture.md` | QA serving subsection |
| `apps/engine/README.md` | Full QA section rewrite — no reranker, no small_talk, tools table |
| `apps/engine/PLAN.md` | Agent QA milestones |
| `apps/engine/TODO.md` | Check off agent + playbooks items |
| `apps/engine/AGENTS.md` | `services/qa/agent_loop.py`, `tools.py`, `playbooks.py` |
| `apps/api/AGENTS.md` | `investigation_trace` persistence if not done |
| `apps/web/AGENTS.md` | Tool events ignored in UI v1 |
| `tests/e2e/AGENTS.md` | Two journey specs |
| `tests/e2e/workflows.md` | Journey #2 status |
| `docs/plans/agent-qa/README.md` | Mark all plans complete in index table |

---

## Repo cleanliness verification

Run and attach to PR:

```bash
# Dead code grep
rg "small_talk|retrieve_code_chunks|is_confident_match|rerank_matches|RETRIEVAL_RERANKER|RETRIEVAL_GRAPH_ENABLED|retrieval_graph_enabled" apps/engine/src
# Must be empty

# Env examples must not advertise removed toggles
rg "RETRIEVAL_GRAPH_ENABLED|RETRIEVAL_RERANKER" apps/engine/.env.example docker-compose.yml docker-compose.gpu.yml .env.example
# Must be empty

# Orphan router
test ! -f apps/engine/src/services/router/small_talk.py

# Tests
cd apps/engine && uv run pytest -q
npm run test -w @codesage/api
npm run test -w @codesage/web
npm run codegen:check
npm run test:e2e -- journey-developer-chat   # or document skip reason
```

---

## CI / coverage

- Engine `services/qa` ≥ 80% line + branch
- No reduction below 80% repo-wide engine coverage gate
- API + web tests green

---

## E2E final gate

| Journey | Spec | Required |
|---|---|---|
| Onboarding | `journey-project-onboarding.spec.ts` | Must still pass |
| Developer chat | `journey-developer-chat.spec.ts` | Must pass with live stack OR documented CI skip policy |

Update `docs/plans/phase-2-e2e.md` — journey #2 implemented.

---

## Optional artifact

If manual 5M LOC benchmark was run (plan 08):

- `docs/plans/agent-qa/benchmark-results.md` with dates, hardware, p95 latency, abstain rate

If not run — document in ADR 0026 open question #3 as **deferred** with target date.

---

## Definition of Done

- [x] ADR 0026 + 0027 **Accepted**
- [x] All docs in sweep table updated
- [x] Grep cleanliness checks pass
- [x] CI green (engine 463 passed @ 86%; API/web ≥ 80%; codegen check clean)
- [ ] E2E journeys documented and passing or explicitly skipped in CI with issue link
- [x] No **Proposed** agent-qa plans left open (README shows complete)

**E2E note:** Journey #2 is implemented and documented with soft-skip policy
(`E2E_SKIP`, unsupported `plannerTools`, optional `E2E_AGENT_QA_REQUIRED=1`).
GitHub Actions does not run Playwright yet — a tracking issue is still required
before this checkbox can close.

---

## Post-acceptance

Create follow-up issues only for:

- Product QA `search_docs` tool (Phase 6)
- UI for tool progress (`tool_start` chips)
- Automated 5M LOC benchmark in CI (if ever feasible)

Do not leave half-deleted reranker docs in compose files.
