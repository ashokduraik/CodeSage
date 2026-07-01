# apps/web — CodeSage Frontend

React + TypeScript single-page app. The user-facing surface for project setup, QA chat, the
expert question queue, and the workflow/page explorer.

> **Status:** **Core UI shell implemented** — Vite + React + Tailwind app with a sidebar layout,
> a **Dashboard** and a **Chat** experience (developer / end-user modes, citations, low-confidence
> expert-review fallback). Data is served by a **temporary in-memory mock layer**
> (`src/shared/mock/`) until the Node API contract exposes these endpoints; swap the mock for the
> generated typed client when it lands. Remaining feature folders (projects, expert-queue,
> explorer) below are the plan for later phases. The health-check client (`src/app/`) is retained.

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

- React + TypeScript, **feature-based** folder structure, **react-router-dom** for navigation.
- **Tailwind CSS** with a CSS-variable design-token theme (`src/index.css`, light/dark via `.dark`).
- UI primitives in `src/shared/ui/` are vendored shadcn/Radix-style components (Button, Input,
  Dialog, etc.); a styled native `<select>` is used instead of a Radix listbox to keep the
  dependency + test surface small.
- WebSocket client for streamed answers (later); typed REST client generated from contracts.

### Coverage note

`src/shared/ui/**` and `src/test/**` are excluded from the coverage gate (see `vite.config.ts`):
the UI primitives are third-party-derived wrappers, not our business logic. **All of our own code**
(features, hooks, layout, lib, mock layer) is held to the workspace **≥ 80%** line+branch threshold.

## Structure (per `docs/final-solution.md` §4.2)

```
web/src/
├─ features/         # one folder per feature: UI + hooks + tests colocated
│  ├─ dashboard/     # overview stats + recent projects/conversations  (implemented)
│  ├─ chat/          # QA chat (dev + end-user), citations, mock send  (implemented)
│  ├─ projects/      # create project, attach repos                    (planned)
│  ├─ expert-queue/  # answer clarifying questions                     (planned)
│  └─ explorer/      # workflow / page / permission browser            (planned)
├─ shared/
│  ├─ ui/            # vendored UI primitives (excluded from coverage)
│  ├─ layout/        # AppLayout, Sidebar, MobileNav + nav config
│  ├─ lib/           # cn(), locale-aware relative time
│  └─ mock/          # TEMPORARY in-memory data layer (replace with contracts client)
└─ app/              # routing, providers, health-check client
```

## How to run

Stack: **Vite + React + TypeScript**, tests with **Vitest** (jsdom) at ≥ 80% coverage.

```bash
npm install                 # from repo root (workspaces)
npm run dev -w @codesage/web    # dev server (proxies /api -> http://localhost:3000)
npm run lint -w @codesage/web   # ESLint (React + TS rules)
npm run build -w @codesage/web  # production build -> apps/web/dist
npm run test -w @codesage/web   # tests + coverage
# or via Docker (nginx serving the build, proxying /api to the api service):
docker compose up -d --build web   # http://localhost:8080
```

## Related docs

- Implementation plan: [`PLAN.md`](./PLAN.md) · Checklist: [`TODO.md`](./TODO.md)
- AI guardrails: [`AGENTS.md`](./AGENTS.md)
- Architecture: [`../../docs/architecture.md`](../../docs/architecture.md)
