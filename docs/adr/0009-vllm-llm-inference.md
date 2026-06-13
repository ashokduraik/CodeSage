# ADR 0009 — Open-weight LLM via vLLM on a 1× 48 GB GPU

- **Status:** Accepted
- **Date:** 2026-06-13
- **Related:** `intermediate-solution.md` §3.8, §5, `final-solution.md` §11

## Context

CodeSage uses an LLM for distillation (understanding workflows/pages/permissions/data-flows)
and interactive QA. Constraints: **open-source only** and **self-hosted** (no paid/commercial
API endpoints). The decision is which serving runtime, model class, and GPU.

## Decision

Serve an **open-weight instruct/code model with vLLM** (Apache 2.0) in production and **Ollama**
for dev, behind a **provider abstraction** so the specific model can change without rewrites.
Use a **small fast model for the router/classifier** and a **larger model for final answers /
distillation**. Hardware: **1× 48 GB GPU** (L40S/A6000) — fits a 14B fp16 / quantized-32B class
model, the MVP sweet spot for understanding quality. Optional **cross-encoder reranker** via TEI.

## Consequences

- All inference stays on-prem; no code leaves the network.
- The single GPU makes the **first distillation pass slow** (hours to 1–2 days over ~30M LOC);
  embeddings and incremental updates are cheap thereafter.
- Adequate for **low QA concurrency** (internal users) at MVP.

## Alternatives considered

- **TGI:** solid HF-ecosystem server; comparable, vLLM chosen for throughput/batching + OpenAI-
  compatible API.
- **Ollama/llama.cpp only:** easiest to run but lower throughput at scale — kept for dev.
- **Paid LLM APIs:** rejected — violates open-source/self-hosted constraints.

## Escape hatch

Add more GPUs / move to Kubernetes (ADR 0012) to shrink the initial-index window or raise QA
concurrency. The provider abstraction in `py-core/llm` allows swapping models/runtimes freely.
