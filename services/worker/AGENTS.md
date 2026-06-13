# AGENTS.md — services/worker

Local rules for the workers. Root [`/AGENTS.md`](../../AGENTS.md) also applies.

## The golden rule

**Stay thin.** Workers pull jobs and delegate to [`packages/py-core`](../../packages/py-core).
Parsing, embedding, graph building, cross-repo linking, and distillation logic live in `py-core`,
not here.

## Do

- Make jobs **idempotent** and **retry-safe** (upserts, not blind inserts) — workers crash and
  retry by design.
- **Isolate failures per file/unit**; record and continue, don't fail the whole repo.
- Always work **incrementally** (diff vs `last_indexed_sha`); never full re-index on update.
- Respect **concurrency caps** so background work doesn't starve interactive QA.
- Use generated Pydantic models from `contracts/jobs.schema.json`.

## Don't

- Don't implement algorithms here — they belong in `py-core`.
- Don't serve HTTP / QA — that is `services/rag`.
- Don't let one bad file abort an entire indexing run.
- Don't commit secrets; tokens are decrypted only in-memory for `sync`.

## Before finishing

Jobs idempotent + isolated; incremental; logic in `py-core`; tests + lint clean; update
`TODO.md`/`README.md`. See `docs/development-workflow.md` §7.
