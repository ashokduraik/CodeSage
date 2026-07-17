# AGENTS.md — apps/web

Local rules for the React frontend. Root [`/AGENTS.md`](../../AGENTS.md) also applies.

## Do

- Keep the **feature-based** structure: UI + hooks + API calls + tests colocated per feature.
- Use **generated types** from `packages/shared-types` (sourced from `contracts/`) for all API
  calls. Never hand-write request/response types.
- Put stateful/data logic in **hooks**; keep components presentational.
- Render **citations** wherever an answer is displayed; handle the "unknown" answer path.
- Accept `tool_start` / `tool_result` SSE chunks but ignore them in UI v1. Do not append tool
  metadata to assistant text; a future tool-progress UI requires its own product change.
- One component/hook per file; descriptive names; colocated `*.test.tsx`.
- Cross-service project/repo flows are covered in [`tests/e2e/`](../../tests/e2e/) (journey specs); keep
  unit tests colocated here for dialogs and hooks.

## Don't

- Don't call the Python service (`apps/engine`) directly — go through
  `apps/api` only.
- Don't add business logic here (parsing, retrieval, distillation belong in `apps/engine/src/services/`).
- Don't reach across features with deep imports — share via `shared/`.
- Don't commit secrets or API tokens.

## Before finishing

Typecheck + lint clean, tests passing, and update this feature's entry in `TODO.md` / `README.md`.
See `docs/development-workflow.md` §7 for the full Definition of Done.
