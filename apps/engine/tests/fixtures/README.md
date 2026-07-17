# Engine test fixtures

## Agent QA golden repository

`agent_qa_repo/` is a committed, minimal TypeScript snapshot used by the ADR 0026 regression
matrix. Tests index its source text through `agent_qa_seed.py`; they never clone Git or contact a
model server.

The snapshot contains:

- `src/loan.utils.ts` — `getMinEmi` and `calculateEmi` for the ADR 0020 EMI questions.
- `src/api/loan.routes.ts` — API route calling `LoanService`.
- `src/services/loan.service.ts` — EMI orchestration plus an HTTP call to the rates service.
- `src/services/user.service.ts` — exact-class symbol lookup fixture.
- `backend/src/rates.controller.ts` — second-repository target for a cross-repo `http_call` edge.

`build_agent_qa_seed()` creates deterministic active project, repository, chunk, graph-node, edge,
and fake-embedding ORM records. Unit tests consume them in memory. Integration tests with a
migrated PostgreSQL database may call `seed_agent_qa_session()`; the caller owns transaction
rollback or commit and must provide an existing actor ID.

Keep fixture paths and spans synchronized with the source files. Add only the smallest source
needed for a regression case so the fixture remains fast and understandable.
