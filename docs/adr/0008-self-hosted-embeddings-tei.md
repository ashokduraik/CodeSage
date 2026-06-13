# ADR 0008 — Self-hosted code embeddings via TEI

- **Status:** Accepted
- **Date:** 2026-06-13
- **Related:** `intermediate-solution.md` §3.7, `final-solution.md` §2

## Context

Semantic retrieval needs embeddings. A hard constraint (NFR-1, NFR-10) is that **private code
must never leave the network** and only **open-source / self-hostable** technologies may be
used. That rules out external embedding APIs.

## Decision

Serve a **self-hosted, code-specialized, JS/TS-capable open embedding model** via **TEI**
(Text Embeddings Inference, Apache 2.0). Store outputs as `halfvec` in pgvector (ADR 0004).
The model is selected to fit the chosen GPU (ADR 0009) and matched to the MEAN/MERN targets.

## Consequences

- Code stays internal; satisfies the self-hosting constraint.
- Requires GPU/CPU serving infra (co-located on the application+GPU machine).
- Embeddings are comparatively cheap and one-time per chunk; not the cost driver (the LLM is).

## Alternatives considered

- **General open embedding model:** easier but less tuned for code semantics. Acceptable
  fallback, not preferred.
- **External embedding API:** best quality, zero infra — but **sends code off-prem**, violating
  NFR-1. Rejected outright.

## Escape hatch

The embedding client is isolated behind `py-core/embedding`, so the specific model or serving
runtime can change without touching callers.
