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
| [`tech-learning-guide.md`](./tech-learning-guide.md) | **Onboarding:** each technology in the stack — what to learn and how CodeSage uses it. |
| [`adr/`](./adr/README.md) | Architecture Decision Records — one file per locked decision, with context + consequences. |

## Per-component docs

Each deployable/package documents itself locally. Each folder carries four files:
`README.md` (what it is + how to run), `PLAN.md` (implementation plan), `TODO.md`
(component checklist), `AGENTS.md` (AI-agent guardrails).

- `apps/web/` — React + TypeScript frontend
- `apps/api/` — Node + TypeScript non-blocking APIs
- `apps/rag/` — Python RAG / QA + background job consumers (sync, parse, embed, xrepo, distill)
- `packages/shared-types/` — TS types generated from `contracts/`

## Reading order for a new contributor (human or AI)

1. `requirement.md` → understand the problem.
2. `final-solution.md` → understand the chosen design.
3. `architecture.md` + `data-model.md` + `schema/` → understand the moving parts.
4. The `AGENTS.md` of the component you are about to touch.
5. `development-workflow.md` → understand how to ship a change safely.

> **Status:** **Phase 0 (Foundation) is implemented and verified** — the monorepo builds,
> migrations apply, `api`/`rag` serve `/health`, and all workspaces have ≥ 80%-coverage tests.
> See the root [`README.md`](../README.md) Quickstart. Later phases add auth/CRUD, indexing,
> distillation, and end-user QA per [`final-solution.md`](./final-solution.md) §12.
