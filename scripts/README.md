# scripts/ — Dev/ops scripts

One-off and repeatable developer/operations scripts. Kept thin; they orchestrate, they don't hold
business logic (that lives in `packages/py-core`).

> **Status:** Scaffolded with this README only. **No scripts written yet.**

## Planned scripts

| Script | Purpose | Phase |
|---|---|---|
| `codegen` | Generate TS types + Pydantic models from `contracts/` (the contracts-first loop). | 0 |
| `backup` | PostgreSQL backup/restore helpers. | 0/7 |
| `reindex-cli` | Manually enqueue a full/partial re-index for a project or repo. | 3+ |

## Conventions

- Prefer the root task runner (`Makefile`/`justfile`) as the entrypoint; scripts here are the
  implementations it calls.
- **No secrets in scripts;** read from env / `.env` (see [`../.env.example`](../.env.example)).
- Keep each script single-purpose with a clear `--help`.
- The `codegen` script is the **only** sanctioned way to update generated types — never hand-edit
  the output (see `.cursor/rules/contracts-first.mdc`).
