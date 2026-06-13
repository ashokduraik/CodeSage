# AGENTS.md — packages/shared-types

Local rules. Root [`/AGENTS.md`](../../AGENTS.md) also applies.

## The golden rule

**Do not hand-edit anything in this package.** Types are **generated** from `contracts/`. To
change a shape: edit `contracts/` → run codegen → the output regenerates here. Manual edits will
be overwritten and will break Node↔Python parity.

## Do

- Treat `contracts/` as the source of truth (ADR 0001).
- Keep a clean public surface (`index.ts`); consumers import only from it.
- Keep generator output diff-friendly and committed so reviewers see real changes.

## Don't

- Don't hand-write or patch generated types.
- Don't import internals; export through the public surface.

## Before finishing

If you changed a shape, you edited `contracts/` (not here), ran codegen, and the CI drift check
passes. See `docs/development-workflow.md` §3.
