# apps/web — Implementation Plan

How we will build the frontend so it stays **easy to maintain** and **AI-friendly**. No code
yet; this is the blueprint.

## Guiding notes (maintainability + AI-friendliness)

- **Feature-based modules.** Each feature folder owns its UI, hooks, API calls, and tests. An
  agent editing "chat" should find everything for chat in one place.
- **Generated API types only.** The `api/` client is typed from `contracts/`. Never hand-write
  shapes — this removes a whole class of drift bugs and gives agents a precise spec.
- **Thin components, logic in hooks.** Keep components presentational; put data/stateful logic in
  custom hooks so it is testable and reusable.
- **Small files, clear names.** One component/hook per file; descriptive names over clever ones.
- **No deep imports across features.** Cross-feature reuse goes through `shared/`.
- **Colocated tests** (`*.test.tsx`) next to the code they verify.

## Build order (by feature, independent of global phases)

1. **App shell** — routing, providers, layout, auth-aware navigation, typed API client scaffold.
2. **Projects feature** — create project, attach repos (URL + token + branch + role), show index
   status.
3. **Chat feature** — WebSocket streaming, message list, citation rendering, audience toggle
   (dev/end-user), page-context capture for page-scoped questions.
4. **Expert-queue feature** — question list, answer form, optimistic update on submit.
5. **Explorer feature** — browse workflows / page map / permissions / data-flows with confidence
   + source links.
6. **Shared polish** — loading/error/empty states, accessibility, design consistency.

## Cross-cutting decisions to make in Phase 0

- Build tool (e.g. Vite) + package manager; state/data-fetching approach; component/styling
  approach; WS client library. Record any non-trivial choice as an ADR in `docs/adr/`.

## Definition of Done (frontend-specific)

- Talks only to `apps/api`; uses generated types from `shared-types`.
- Citations rendered wherever an answer is shown; "unknown" answers handled gracefully.
- Tests colocated and passing; lint/typecheck clean.
- `README.md` / `TODO.md` updated for the feature delivered.
