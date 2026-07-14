"""Default tuning values for CodeSage engine.

These are standard, rarely-changed knobs (retrieval weights, worker timings, timeouts,
context-window sizing, sync limits). They are loaded as ``Settings`` field defaults in
``config/__init__.py`` and remain env-overridable, but they are intentionally **not** listed
in ``apps/engine/.env.example`` because they do not change from one deployment to another.

Environment-specific values (connections, secrets, endpoints, model ids, ports) and per-deploy
feature toggles live in ``.env.example`` instead. See ``.cursor/rules/engine-config.mdc`` for the
rule that governs which bucket a new config knob belongs in.
"""

from __future__ import annotations

# --- Embeddings ---
DEFAULT_EMBEDDING_DIMENSION = 1024  # pgvector column width fallback; overridden by EMBEDDING_DIMENSION

# --- Worker ---
WORKER_POLL_SECONDS = 2.0  # reserved poll interval; consumer uses idle sleep today
WORKER_IDLE_SECONDS = 10.0  # sleep between polls when the jobs queue is empty
WORKER_MAX_JOB_ATTEMPTS = 3  # attempts before a job is marked failed

# --- Inference / embedding timeouts ---
EMBEDDING_TIMEOUT_SECONDS = 300.0  # embedding HTTP timeout; raise for slow CPU / cold loads
LLM_TIMEOUT_SECONDS = 300.0  # LLM stream timeout; raise for slow CPU / cold loads
# When true, request a final usage SSE frame. Some OpenAI-compatible servers buffer
# the whole completion when this is set — leave off for reliable token streaming.
LLM_STREAM_INCLUDE_USAGE = False
STARTUP_PROBE_TIMEOUT_SECONDS = 5.0  # per-backend reachability probe at boot (non-fatal)

# --- Context window (grounded QA) ---
LLM_MAX_CONTEXT_TOKENS = 8192  # fallback window when auto-detection is off or fails
LLM_COMPLETION_RESERVE_TOKENS = 1024  # tokens held back for the answer (also sent as max_tokens)
LLM_MAX_HISTORY_TURNS = 10  # max prior conversation turns packed into the prompt
LLM_MIN_RETRIEVAL_CONTEXT_TOKENS = 2048  # minimum tokens reserved for retrieved code excerpts

# --- Retrieval (developer QA) ---
RETRIEVAL_TOP_K = 20  # legacy fallback for vector top-k when RETRIEVAL_VECTOR_TOP_K unset
RETRIEVAL_VECTOR_TOP_K = 12  # ceiling for vector leg top-k (adaptive tier may use less)
RETRIEVAL_KEYWORD_TOP_K = 12  # ceiling for keyword leg top-k
RETRIEVAL_SYMBOL_TOP_K = 12  # ceiling for symbol leg top-k
RETRIEVAL_FUSED_TOP_K = 20  # max fused hits passed to graph expansion
RETRIEVAL_RRF_K = 60  # RRF smoothing constant
RETRIEVAL_VECTOR_WEIGHT = 1.0  # balanced-profile RRF weight for vector leg
RETRIEVAL_KEYWORD_WEIGHT = 2.0  # balanced-profile RRF weight for keyword leg
RETRIEVAL_SYMBOL_WEIGHT = 3.0  # balanced-profile RRF weight for symbol leg
RETRIEVAL_KEYWORD_MIN_SIMILARITY = 0.15  # minimum trigram score for keyword hits
RETRIEVAL_SYMBOL_MIN_SIMILARITY = 0.35  # minimum trigram score for symbol hits
RETRIEVAL_MAX_DISTANCE = 0.45  # hard fail for vector-only hits above this distance
RETRIEVAL_CONTEXT_TOP_K = 10  # post-graph prune limit before LLM packing
RETRIEVAL_MIN_CONFIDENCE = 0.45  # hybrid confidence abstain threshold (NFR-7)
RETRIEVAL_ADAPTIVE_MEDIUM_MIN_CHUNKS = 5000  # active-chunk boundary (small -> medium tier)
RETRIEVAL_ADAPTIVE_LARGE_MIN_CHUNKS = 50000  # active-chunk boundary (medium -> large tier)
RETRIEVAL_CONFIDENCE_WEIGHT_RETRIEVAL = 0.40  # hybrid confidence: fused retrieval score weight
RETRIEVAL_CONFIDENCE_WEIGHT_GRAPH = 0.30  # hybrid confidence: graph connectivity weight
RETRIEVAL_CONFIDENCE_WEIGHT_SYMBOL = 0.20  # hybrid confidence: symbol/keyword exactness weight
RETRIEVAL_CONFIDENCE_WEIGHT_COVERAGE = 0.10  # hybrid confidence: distinct-file coverage weight
RETRIEVAL_MIN_DISTINCT_FILES = 1  # target distinct files for citation coverage score
RETRIEVAL_GRAPH_MAX_DEPTH = 2  # max graph hops from vector-hit seeds
RETRIEVAL_GRAPH_MAX_EXTRA_CHUNKS = 4  # max additional chunks added via graph expansion

# --- Reranker (M3.3 cross-encoder tuning; endpoint + enable flag stay in .env) ---
RETRIEVAL_RERANKER_MODEL = "BAAI/bge-reranker-v2-m3"  # cross-encoder model id (TEI MODEL_ID)
RETRIEVAL_RERANKER_INPUT_K = 25  # max candidates sent to the reranker
RETRIEVAL_RERANKER_OUTPUT_K = 8  # chunks kept after rerank
RETRIEVAL_RERANKER_TIMEOUT_SECONDS = 30.0  # rerank HTTP timeout
RETRIEVAL_RERANKER_MAX_DOC_CHARS = 1500  # per-chunk text cap in the rerank payload

# --- Sync ---
SYNC_MAX_FILE_BYTES = 512_000  # skip indexing files larger than this

# --- Freshness (Phase 3) ---
FRESHNESS_POLL_INTERVAL_SECONDS = 1800  # fallback poll interval when webhooks miss pushes

# --- Distillation (Phase 4) ---
DISTILL_GRAPH_MAX_DEPTH = 3  # max hops from entrypoint seeds during graph walk
DISTILL_MAX_ENTRYPOINTS = 50  # cap route/http_call seeds per full derive pass
DISTILL_BATCH_SIZE = 8  # artifacts processed per LLM batch within one job
DISTILL_MIN_CONFIDENCE = 0.45  # rows below this are persisted but flagged low-confidence
DISTILL_HEURISTIC_CONFIDENCE = 0.55  # confidence for graph-heuristic fallback when LLM unset
