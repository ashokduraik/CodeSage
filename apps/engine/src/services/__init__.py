"""Business logic layer — orchestrates repositories and external clients.

Future modules: parsing, graph, embedding, llm, retrieval, router, distill, experts.
Job handlers and QA pipeline call into this layer; they do not access repositories directly
from `api/` or `workers/` once wired (Phase 1+).
"""
