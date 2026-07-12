# ADR 0022 — RAG tuning defaults in `config/constants.py`

- **Status:** Accepted
- **Date:** 2026-07-12
- **Related:** ADR 0020 (hybrid retrieval), ADR 0021 (retrieval quality pass), ADR 0015 (single
  Python deployable); `.cursor/rules/rag-config.mdc`, `.cursor/rules/env-example-sync.mdc`

## Context

`apps/rag/.env.example` had grown to ~45 variables, most of them retrieval and worker **tuning
knobs** (RRF weights, top-k, hybrid-confidence weights, adaptive tiers, timeouts, context-window
sizing) whose defaults duplicated the field defaults in `Settings`
(`apps/rag/src/config/__init__.py`). These values are standard across deployments — an operator
setting up CodeSage does not tune RRF weights or prune sizes to bring up a new environment. The
long file obscured the handful of variables that genuinely change per deployment (connections,
secrets, endpoints, model ids) and per-deploy feature toggles.

Duplicating each default in two places (`.env.example` and `Settings`) also invites drift.

## Decision

Split RAG configuration into two homes, both still read through `Settings`:

1. **`apps/rag/.env.example` + sibling `.env`** — environment-specific values only: connections,
   secrets, endpoints, ports, model ids, the cross-service `WORKER_STALE_JOB_SECONDS`, and
   per-deploy **feature toggles** (`LLM_CONTEXT_DETECT_ENABLED`, `RETRIEVAL_GRAPH_ENABLED`,
   `RETRIEVAL_RERANKER_ENABLED`, `FRESHNESS_POLL_ENABLED`) plus the reranker endpoint.
2. **`apps/rag/src/config/constants.py`** — standard tuning defaults, each with a one-line purpose
   comment. `Settings` tuning fields read their default from `constants`, so the value lives in
   exactly one place.

Constants **remain env-overridable**: they are still `Settings` fields, so setting the matching
env var overrides the default for a single deployment. They are simply no longer documented in
`.env.example`.

A new rule `.cursor/rules/rag-config.mdc` governs which bucket a new knob belongs in, and
`env-example-sync.mdc` cross-references it.

## Consequences

- **`.env.example` is short and operator-focused** (~15 variables): what to fill to run CodeSage.
- **`constants.py` is the canonical list of tuning defaults**, self-documenting via inline comments.
- **No behavior change**: defaults are identical; env override still works for every knob.
- **Supersedes the config-location pointers** in ADR 0020 and ADR 0021 (which said tunables are
  "documented in `apps/rag/.env.example`"). Those decisions are otherwise unchanged; tunable
  defaults now live in `constants.py` with the enable flags/endpoints remaining in `.env.example`.

## Alternatives considered

- **Hard constants (remove `Settings` fields):** simplest mental model but drops the emergency
  env-override escape hatch; rejected.
- **Leave everything in `.env.example`:** status quo; keeps the clutter and the two-place drift;
  rejected.
- **Mirror the full constants list in `README.md`:** guaranteed to drift from code; rejected in
  favor of pointing readers at `constants.py`.

## Escape hatch

Any tuning constant can be promoted back to a documented `.env.example` variable if a real
deployment needs to tune it routinely — it is already a `Settings` field, so only documentation
changes, not code.
