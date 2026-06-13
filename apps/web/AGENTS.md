# AGENTS.md — apps/web

Local rules for the React frontend. Root [`/AGENTS.md`](../../AGENTS.md) also applies.

## Do

- Keep the **feature-based** structure: UI + hooks + API calls + tests colocated per feature.
- Use **generated types** from `packages/shared-types` (sourced from `contracts/`) for all API
  calls. Never hand-write request/response types.
- Put stateful/data logic in **hooks**; keep components presentational.
- Render **citations** wherever an answer is displayed; handle the "unknown" answer path.
- One component/hook per file; descriptive names; colocated `*.test.tsx`.

## Don't

- Don't call the Python services (`services/rag`, `services/worker`) directly — go through
  `apps/api` only.
- Don't add business logic here (parsing, retrieval, distillation belong in `py-core`).
- Don't reach across features with deep imports — share via `shared/`.
- Don't commit secrets or API tokens.

## Before finishing

Typecheck + lint clean, tests passing, and update this feature's entry in `TODO.md` / `README.md`.
See `docs/development-workflow.md` §7 for the full Definition of Done.
