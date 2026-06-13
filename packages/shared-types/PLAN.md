# packages/shared-types — Implementation Plan

How we will set up generated TS types so the system stays **easy to maintain** and
**AI-friendly**. No code yet.

## Guiding notes (maintainability + AI-friendliness)

- **Generation, not authorship.** The whole value of this package is that it is *derived*. The
  plan is mostly about wiring reliable codegen, not writing types.
- **Single command.** Regeneration must be one command (in `scripts/` + root task runner) so
  humans and agents never hand-edit.
- **Fail loud on drift.** CI should regenerate and fail if the committed output differs from a
  fresh generation — this guarantees `contracts/` and types never silently diverge.
- **Stable, readable output.** Pick a generator whose output is diff-friendly so reviewers can
  see real shape changes.

## Build order (Phase 0 alongside contracts)

1. Choose the OpenAPI/JSON-Schema → TS generator.
2. Add the codegen script + a root one-liner (`make codegen` / `just codegen`).
3. Generate from `contracts/openapi.node.yaml` and `contracts/jobs.schema.json`.
4. Export a clean public surface (`index.ts`) for `apps/web` and `apps/api` to import.
5. Add a CI "generated types are up to date" check.

## Definition of Done

- One-command regeneration; output committed and reviewed.
- CI drift check passing.
- `apps/web` and `apps/api` import only from this package's public surface.
- No hand-edited generated files.
