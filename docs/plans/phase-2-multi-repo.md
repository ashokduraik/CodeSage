# Phase 2 — Multi-repo linking

Implementation plan per [`final-solution.md` §12](../final-solution.md). Architecture:
[ADR 0023](../adr/0023-cross-repo-linking.md).

**Exit criteria:** A workflow/graph query spans frontend → backend → IAM (cross-repo
`graph_edges` connect HTTP client calls to route handlers; developer QA retrieval expands
across those links).

**Out of scope for Phase 2:** webhooks/cron freshness (Phase 3), distillation (Phase 4),
expert loop (Phase 5), end-user product QA (Phase 6).

---

## Milestones

### M1 — API signal extraction during parse (ADR 0023)

| Task | Module | Deliverables |
|---|---|---|
| Regex extractors for `fetch`, `axios`, Angular `HttpClient`, Express routes | `services/graph/api_signals.py` | `http_call` + `route` graph nodes |
| Persist signals during parse | `services/graph/extract.py` | Nodes linked to file via `contains` edges |

**Done when:** Parsed repos contain `http_call` and `route` nodes with normalized `METHOD /path` names.

### M2 — Cross-repo link resolver (`xrepo` job) (ADR 0023)

| Task | Module | Deliverables |
|---|---|---|
| Match calls ↔ routes across repos | `services/xrepo/link_resolver.py` | Cross-repo `http_call` edges |
| Job handler + worker dispatch | `services/xrepo/run_xrepo.py`, `workers/handlers/dispatch.py` | `xrepo` consumer registered |
| Enqueue when all repos indexed | `services/indexing/xrepo_enqueue.py` | Auto-queue from embed completion |

**Done when:** Two-repo project produces cross-repo edges after indexing; job is idempotent.

### M3 — Graph-augmented retrieval (ADR 0023)

| Task | Module | Deliverables |
|---|---|---|
| Expand fused retrieval hits via `http_call` edges | `services/retrieval/graph_expand.py` | Chunks from linked repos in QA context |
| Tunables | `config/__init__.py` | `retrieval_graph_*` settings |

**Done when:** A question seeded in the frontend repo retrieves backend route/chunk citations.

---

## Definition of Done (Phase 2)

- [x] Exit criteria met on a multi-repo test project (verified via E2E fixture tests in `test_cross_repo_exit_criteria.py`; live-stack manual steps in §Verification below).
- [x] Implementation complete (API signals, `xrepo` job, graph-augmented retrieval, UI polling).
- [x] Shapes from `contracts/` (`XrepoPayload` in `jobs.schema.json`).
- [x] `xrepo` job handler idempotent; deduped enqueue per project.
- [x] Graph expansion enabled for developer QA path.
- [x] Tests ≥ 80% (line + branch) on touched packages.
- [x] `TODO.md` / `PLAN.md` updated in `apps/rag`.
- [x] `.env.example` documents retrieval + graph expansion tunables (`RETRIEVAL_GRAPH_*`).

---

## Verification (manual / E2E)

**Automated (fixture pair):** [`apps/rag/tests/services/test_cross_repo_exit_criteria.py`](../../apps/rag/tests/services/test_cross_repo_exit_criteria.py) — reads `tests/e2e/fixtures/frontend` + `backend`, asserts `GET /api/login` signals and cross-repo link resolution.

**Automated (onboarding):** [`tests/e2e/web/journey-project-onboarding.spec.ts`](../../tests/e2e/web/journey-project-onboarding.spec.ts) — create project, attach public + private repos via UI, repo actions, dashboard. Run: `npm run test:e2e` (see [`tests/e2e/README.md`](../../tests/e2e/README.md)).

**Manual (cross-repo graph / QA — exit criteria):**

1. Attach frontend + backend repos to one project; wait for indexing on both.
2. Confirm an `xrepo` job runs (`payload.projectId` set) after the second repo embeds.
3. Query `graph_edges` for cross-repo rows with `kind = 'http_call'`.
4. Ask a developer question that spans repos — answer citations should include files from both.

See also [`phase-1-mvp-code-qa.md`](./phase-1-mvp-code-qa.md) for single-repo QA setup.

**E2E plan:** [`phase-2-e2e.md`](./phase-2-e2e.md) — journey catalog, env model, planned chat/citations journey.

---

## References

- [`final-solution.md` §6.3](../final-solution.md) — cross-repo linking
- [`intermediate-solution.md` §7](../intermediate-solution.md) — multi-repo handling
- Phase 1 plan: [`phase-1-mvp-code-qa.md`](./phase-1-mvp-code-qa.md)
