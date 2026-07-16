# CodeSage — Documentation Hub

This folder is the single home for all project documentation. Start here.

## Source-of-truth specs (do not delete; treat as canonical)

| Doc | What it answers |
|---|---|
| [`requirement.md`](./requirement.md) | **What & why** — product requirements, users/roles, FRs/NFRs, success criteria. |
| [`intermediate-solution.md`](./intermediate-solution.md) | **Options & trade-offs** — every technology decision with alternatives considered. |
| [`final-solution.md`](./final-solution.md) | **The locked solution** — finalized stack, architecture, data model, roadmap. Basis for implementation. |

## Working docs (maintained alongside the code)

| Doc | Purpose |
|---|---|
| [`architecture.md`](./architecture.md) | Consolidated architecture overview + component map + cross-service contracts. |
| [`data-model.md`](./data-model.md) | PostgreSQL schema overview (domains, relationships, trust model). |
| [`schema/`](./schema/README.md) | **Per-table column reference** — one file per table. |
| [`development-workflow.md`](./development-workflow.md) | How we work: branching, contracts-first codegen, testing, review, Definition of Done. |
| [`plans/phase-1-mvp-code-qa.md`](./plans/phase-1-mvp-code-qa.md) | **Phase 1 plan** — MVP code QA milestones and build order. |
| [`plans/phase-2-multi-repo.md`](./plans/phase-2-multi-repo.md) | **Phase 2 plan** — multi-repo linking and cross-repo graph resolver. |
| [`plans/phase-2-e2e.md`](./plans/phase-2-e2e.md) | **Phase 2 E2E** — UI onboarding journey, public/private repo attach, env preflight. |
| [`plans/agent-qa/`](./plans/agent-qa/README.md) | **Agent-QA plans** — retrieval tools, confidence-gated investigation loop, legacy cleanup, E2E, and learned playbooks. |
| [`tech-learning-guide.md`](./tech-learning-guide.md) | **Onboarding:** each technology in the stack — what to learn and how CodeSage uses it. |
| [`adr/`](./adr/README.md) | Architecture Decision Records — one file per locked decision, with context + consequences. |

## Per-component docs

Each deployable/package documents itself locally. Each folder carries four files:
`README.md` (what it is + how to run), `PLAN.md` (implementation plan), `TODO.md`
(component checklist), `AGENTS.md` (AI-agent guardrails).

- `apps/web/` — React + TypeScript frontend
- `apps/api/` — Node + TypeScript non-blocking APIs
- `apps/engine/` — Python RAG / QA + background job consumers (sync, parse, embed, xrepo, distill)
- `packages/shared-types/` — TS types generated from `contracts/`

## Reading order for a new contributor (human or AI)

1. `requirement.md` → understand the problem.
2. `final-solution.md` → understand the chosen design.
3. `architecture.md` + `data-model.md` + `schema/` → understand the moving parts.
4. The `AGENTS.md` of the component you are about to touch.
5. `development-workflow.md` → understand how to ship a change safely.
6. The relevant phase plan in `docs/plans/` when working on roadmap milestones.

> **Status (implementation):**
> - **Phase 0 (Foundation)** — monorepo, migrations, auth skeleton, Compose, CI, ≥ 80% tests.
> - **Phase 1 (current code QA)** — fixed hybrid retrieval (symbol + keyword + vector, RRF), citations, confidence abstain, SSE chat proxy, persisted conversations, multi-turn history, and stop generation are implemented ([ADR 0020](./adr/0020-hybrid-retrieval.md), [ADR 0021](./adr/0021-retrieval-quality-pass.md)).
> - **Agent QA (proposed target; partially implemented)** — the LLM selects bounded retrieval tools; code recomputes evidence confidence after each round; answer at **≥0.8**, otherwise continue for up to **5 iterations** and abstain. Every answer cites fresh evidence. Project-scoped successful investigation paths become optional planner hints, never factual ground truth. Retrieval tools/config exist; loop replacement, cleanup, E2E, and playbooks follow [`plans/agent-qa/`](./plans/agent-qa/README.md) ([ADR 0026](./adr/0026-agent-orchestrated-developer-qa.md), [ADR 0027](./adr/0027-qa-investigation-playbooks.md)).
> - **Phase 2 (Multi-repo)** — API signal extraction and the `xrepo` cross-repo linker are implemented. The current fixed path expands graph neighbours automatically; the agent target retains those edges behind the on-demand `graph_expand` tool ([ADR 0023](./adr/0023-cross-repo-linking.md), [ADR 0026](./adr/0026-agent-orchestrated-developer-qa.md)).
> - **Phase 3 (Freshness)** — webhooks ([ADR 0017](./adr/0017-webhook-registration-on-connect.md)) + scheduled poll fallback ([ADR 0024](./adr/0024-freshness-scheduled-poll.md)) → incremental re-index. See [`plans/phase-3-freshness.md`](./plans/phase-3-freshness.md).
> - **Phases 3–7** — freshness webhooks, distillation, expert loop, end-user QA, hardening (see [`final-solution.md`](./final-solution.md) §12).
>
> Manual/E2E verification of phase exit criteria may still be open — see each plan's Definition of Done.
> Quickstart: root [`README.md`](../README.md).
