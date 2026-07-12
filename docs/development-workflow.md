# CodeSage — Development Workflow

How we build CodeSage so the codebase stays **easy to maintain** and **AI-friendly**. This is
the process every contributor (human or agent) follows.

## 1. Core principles

1. **Contracts first.** Cross-service shapes are defined in `contracts/` and **generated**,
   never hand-written. Edit the contract, run codegen, then write code against the types.
2. **One concern, one place.** DB schema → `db/migrations/`. API shapes → `contracts/`.
   Prompts → `apps/engine/src/services/llm` + `apps/engine/src/services/distill`. Business logic → `apps/engine/src/services/` (not `api/` or `workers/`).
3. **Respect the boundary.** Node never blocks on heavy work; Python owns heavy/blocking work.
4. **Small, single-purpose files** with descriptive names over large grab-bag files.
5. **No deep cross-module imports.** Modules expose a public surface (`index.ts` /
   `__init__.py`); internals stay private.
6. **Ground everything.** Features that answer questions must cite sources; never ship a path
   that can hallucinate without an "unknown" fallback.

## 2. Branching & commits

- `main` is always releasable. Work on short-lived branches: `feat/…`, `fix/…`, `docs/…`,
  `chore/…`.
- Conventional-commit-style messages (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).
- One logical change per PR; keep PRs reviewable (small and focused).
- **Do not commit secrets.** `.env.example` documents variables; real secrets never get committed.

## 3. The contracts-first loop (most important)

```
1. Edit contracts/openapi.node.yaml | openapi.engine.yaml | jobs.schema.json
2. Run codegen  (scripts/ codegen)
3. TS types → packages/shared-types ;  Pydantic models → apps/engine/ (when generated)
4. Implement against generated types on both sides (Node + Python)
5. Update `docs/data-model.md` and `docs/schema/<table>.md` if persistence changed; add/adjust `apps/api/src/platform/migrations/`
```

If Node and Python disagree at runtime, the contract or the codegen is wrong — fix there, not
with local patches.

## 4. Where things go (decision table)

| You are changing… | Edit here | Also update |
|---|---|---|
| A request/response shape | `contracts/` → codegen | `shared-types`, both call sites |
| A job payload | `contracts/jobs.schema.json` → codegen | enqueuer (Node) + consumer (`apps/engine`) |
| DB schema | `apps/api/src/platform/migrations/` (new migration) | `docs/data-model.md`, `docs/schema/<table>.md` |
| Business logic (parse/graph/embed/distill/retrieve/route) | `apps/engine/src/services/<module>` | thin wiring in `src/api/`, `src/workers/` |
| A prompt | `apps/engine/src/services/llm` or `apps/engine/src/services/distill` | nothing else hand-edited |
| Frontend feature | `apps/web/src/features/<feature>` | `apps/web` API client (from contracts) |
| A new architectural decision | `docs/adr/` (new ADR) | link it from affected READMEs |

## 5. Testing

- **Frameworks:** **Vitest** (JS/TS unit), **pytest** (Python unit), **Playwright** (E2E). See
  `.cursor/rules/testing-standards.mdc`.
- **Colocated tests:** `*.test.ts` next to TS code; `test_*.py` next to Python code.
- **Cross-service / E2E tests:** `tests/e2e/` (Playwright). See [`tests/e2e/README.md`](../tests/e2e/README.md)
  and [`tests/e2e/AGENTS.md`](../tests/e2e/AGENTS.md). Journeys are UI-driven (no API pre-seed);
  required env is validated in global-setup.
- **≥ 80% coverage (line + branch) is required** for all code, enforced by CI gates on both the
  TypeScript and Python sides. A coverage drop below 80% fails the build; do not lower the threshold.
  Rare, genuinely-uncoverable lines may use a justified inline ignore (`/* istanbul ignore next */`,
  `# pragma: no cover`). See `.cursor/rules/test-coverage.mdc`.
- A change is not done until its tests pass, coverage is ≥ 80%, and lint is clean.
- Prefer testing the **public surface** of a module, not its internals.

## 6. AI-agent guidance

- Read the nearest `AGENTS.md` before editing a folder. Root `AGENTS.md` holds repo-wide rules.
- `.cursor/rules/*.mdc` apply automatically by file glob — they encode the same boundaries.
- When unsure about an API shape, read `contracts/` — never guess request/response shapes.
- When adding a non-obvious decision, write an ADR so future agents have the *why*.

## 7. Definition of Done (per change)

- [ ] Respects the Node/Python boundary.
- [ ] Contracts updated + codegen run (if any cross-service shape changed).
- [ ] Business logic lives in `apps/engine/src/services/` (if Python); `src/api/` and `src/workers/` stay thin.
- [ ] Migration added + `docs/data-model.md` and `docs/schema/<table>.md` updated (if schema changed).
- [ ] Tests colocated and passing; **≥ 80% coverage (line + branch)**; lint clean.
- [ ] Relevant `README.md` / `TODO.md` / `PLAN.md` updated.
- [ ] No secrets committed; env-specific vars/toggles added to `.env.example` (and sibling `.env`); `apps/engine` standard tuning defaults go in `src/config/constants.py`, not `.env.example` (see `.cursor/rules/engine-config.mdc`).
- [ ] ADR added for any new architectural decision.

## 8. Phased roadmap (reference)

Although per-component TODOs are organized **by feature**, the overall delivery follows the
8-phase roadmap in [`final-solution.md`](./final-solution.md) §12 (Foundation → Hardening).
Use it to sequence work across components.
