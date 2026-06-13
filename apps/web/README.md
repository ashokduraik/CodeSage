# apps/web — CodeSage Frontend

React + TypeScript single-page app. The user-facing surface for project setup, QA chat, the
expert question queue, and the workflow/page explorer.

> **Status:** **Phase 0 skeleton implemented** — Vite + React app with a health-check landing
> page and 100%-coverage tests. Feature folders (projects, chat, expert-queue, explorer) below
> are the plan for later phases.

## Responsibilities

- **Project & repo setup** — create a project, attach one or more repositories (URL + token),
  configure branches/roles (`frontend`/`backend`/`iam`).
- **QA chat** (dev + end-user) — stream answers over WebSocket, render **citations**, pass the
  user's current page/route as context for page-scoped product questions.
- **Expert question queue** — list clarifying questions and submit authoritative answers.
- **Workflow / page / permission explorer** — browse derived knowledge with confidence + sources.

## Boundaries (what this app does NOT do)

- No business logic and no direct DB/LLM access. It talks **only** to the Node API (`apps/api`).
- It never calls the Python services directly.
- API types are **generated** from `contracts/` and consumed via `packages/shared-types`; do not
  hand-write request/response types.

## Tech

- React + TypeScript, **feature-based** folder structure.
- WebSocket client for streamed answers; typed REST client generated from contracts.

## Planned structure (per `docs/final-solution.md` §4.2)

```
web/src/
├─ features/         # one folder per feature: UI + hooks + api calls + tests colocated
│  ├─ projects/      # create project, attach repos
│  ├─ chat/          # QA chat (dev + end-user), WS streaming, citations
│  ├─ expert-queue/  # answer clarifying questions
│  └─ explorer/      # workflow / page / permission browser
├─ shared/           # reusable UI components, hooks, lib
├─ api/              # thin client typed from contracts/
└─ app/              # routing, providers, layout
```

## How to run

Stack: **Vite + React + TypeScript**, tests with **Vitest** (jsdom) at 100% coverage.

```bash
npm install                 # from repo root (workspaces)
npm run dev -w @codesage/web    # dev server (proxies /api -> http://localhost:3000)
npm run build -w @codesage/web  # production build -> apps/web/dist
npm run test -w @codesage/web   # tests + coverage
# or via Docker (nginx serving the build, proxying /api to the api service):
docker compose up -d --build web   # http://localhost:8080
```

## Related docs

- Implementation plan: [`PLAN.md`](./PLAN.md) · Checklist: [`TODO.md`](./TODO.md)
- AI guardrails: [`AGENTS.md`](./AGENTS.md)
- Architecture: [`../../docs/architecture.md`](../../docs/architecture.md)
