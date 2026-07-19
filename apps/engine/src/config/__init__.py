"""Settings and environment access for CodeSage Python services."""

from __future__ import annotations

import os
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

from . import constants

# Re-exported for backwards compatibility; the value now lives in ``constants``.
DEFAULT_EMBEDDING_DIMENSION = constants.DEFAULT_EMBEDDING_DIMENSION

_ENGINE_ROOT = Path(__file__).resolve().parents[2]
_MONOREPO_ROOT = _ENGINE_ROOT.parents[1]


def resolve_env_files() -> tuple[Path, ...]:
    """Return ``.env`` files to load, lowest priority first.

    Skips file loading under pytest so tests control env via ``monkeypatch``.
    Loads repo-root ``.env`` then ``apps/engine/.env`` (engine file wins on conflicts).

    @returns Tuple of existing env file paths.
    """
    if os.getenv("PYTEST_CURRENT_TEST"):
        return ()
    candidates = (_MONOREPO_ROOT / ".env", _ENGINE_ROOT / ".env")
    return tuple(path for path in candidates if path.is_file())


class Settings(BaseSettings):
    """Application settings, read from the environment (see .env.example)."""

    model_config = SettingsConfigDict(env_prefix="", extra="ignore")

    # Environment-specific values (connections, secrets, endpoints, model ids) keep literal
    # defaults and are documented in ``.env.example``. Standard tuning knobs read their default
    # from ``constants`` so the value lives in exactly one place; see ``constants`` module and
    # ``.cursor/rules/engine-config.mdc``.
    database_url: str = "postgresql://codesage:change-me@localhost:5432/codesage"
    repo_clone_dir: str = "/var/codesage/repos"
    embedding_dimension: int = constants.DEFAULT_EMBEDDING_DIMENSION

    token_enc_key: str = ""
    log_level: str = "info"
    # Cross-service contract: must match ``apps/api`` + root ``.env`` (stale reclaim / re-index throttle).
    worker_stale_job_seconds: int = 600

    worker_poll_seconds: float = constants.WORKER_POLL_SECONDS
    worker_idle_seconds: float = constants.WORKER_IDLE_SECONDS
    worker_max_job_attempts: int = constants.WORKER_MAX_JOB_ATTEMPTS

    tei_base_url: str = ""
    tei_embed_model: str = ""
    embedding_timeout_seconds: float = constants.EMBEDDING_TIMEOUT_SECONDS
    vllm_base_url: str = ""
    vllm_model: str = ""
    llm_timeout_seconds: float = constants.LLM_TIMEOUT_SECONDS
    llm_stream_include_usage: bool = constants.LLM_STREAM_INCLUDE_USAGE
    startup_probe_timeout_seconds: float = constants.STARTUP_PROBE_TIMEOUT_SECONDS

    # Context window sizing: the LLM prompt is packed to fill the connected model's
    # context. When auto-detection fails, ``llm_max_context_tokens`` is the fallback,
    # and ``llm_completion_reserve_tokens`` is held back for the generated answer.
    # ``llm_context_detect_enabled`` is a per-deploy toggle documented in ``.env.example``.
    llm_context_detect_enabled: bool = True
    llm_max_context_tokens: int = constants.LLM_MAX_CONTEXT_TOKENS
    llm_completion_reserve_tokens: int = constants.LLM_COMPLETION_RESERVE_TOKENS
    llm_max_history_turns: int = constants.LLM_MAX_HISTORY_TURNS
    llm_min_retrieval_context_tokens: int = constants.LLM_MIN_RETRIEVAL_CONTEXT_TOKENS

    retrieval_top_k: int = constants.RETRIEVAL_TOP_K
    retrieval_vector_top_k: int = constants.RETRIEVAL_VECTOR_TOP_K
    retrieval_keyword_top_k: int = constants.RETRIEVAL_KEYWORD_TOP_K
    retrieval_symbol_top_k: int = constants.RETRIEVAL_SYMBOL_TOP_K
    retrieval_rrf_k: int = constants.RETRIEVAL_RRF_K
    retrieval_vector_weight: float = constants.RETRIEVAL_VECTOR_WEIGHT
    retrieval_keyword_weight: float = constants.RETRIEVAL_KEYWORD_WEIGHT
    retrieval_symbol_weight: float = constants.RETRIEVAL_SYMBOL_WEIGHT
    retrieval_keyword_min_similarity: float = constants.RETRIEVAL_KEYWORD_MIN_SIMILARITY
    retrieval_symbol_min_similarity: float = constants.RETRIEVAL_SYMBOL_MIN_SIMILARITY
    retrieval_max_distance: float = constants.RETRIEVAL_MAX_DISTANCE
    retrieval_adaptive_medium_min_chunks: int = constants.RETRIEVAL_ADAPTIVE_MEDIUM_MIN_CHUNKS
    retrieval_adaptive_large_min_chunks: int = constants.RETRIEVAL_ADAPTIVE_LARGE_MIN_CHUNKS
    retrieval_adaptive_xlarge_min_chunks: int = constants.RETRIEVAL_ADAPTIVE_XLARGE_MIN_CHUNKS
    retrieval_vector_top_k_xlarge: int = constants.RETRIEVAL_VECTOR_TOP_K_XLARGE
    retrieval_keyword_top_k_xlarge: int = constants.RETRIEVAL_KEYWORD_TOP_K_XLARGE
    retrieval_symbol_top_k_xlarge: int = constants.RETRIEVAL_SYMBOL_TOP_K_XLARGE
    retrieval_confidence_weight_retrieval: float = constants.RETRIEVAL_CONFIDENCE_WEIGHT_RETRIEVAL
    retrieval_confidence_weight_graph: float = constants.RETRIEVAL_CONFIDENCE_WEIGHT_GRAPH
    retrieval_confidence_weight_symbol: float = constants.RETRIEVAL_CONFIDENCE_WEIGHT_SYMBOL
    retrieval_confidence_weight_coverage: float = constants.RETRIEVAL_CONFIDENCE_WEIGHT_COVERAGE
    retrieval_min_distinct_files: int = constants.RETRIEVAL_MIN_DISTINCT_FILES
    # Graph expand is always available (agent tool); depth/extra caps only — no kill-switch.
    retrieval_graph_max_depth: int = constants.RETRIEVAL_GRAPH_MAX_DEPTH
    retrieval_graph_max_extra_chunks: int = constants.RETRIEVAL_GRAPH_MAX_EXTRA_CHUNKS
    # Agent QA (ADR 0026) — env-overridable; defaults from constants (not in .env.example).
    qa_agent_max_iterations: int = constants.QA_AGENT_MAX_ITERATIONS
    qa_agent_min_confidence: float = constants.QA_AGENT_MIN_CONFIDENCE
    qa_agent_confidence_top_n: int = constants.QA_AGENT_CONFIDENCE_TOP_N
    qa_agent_max_pool_chunks: int = constants.QA_AGENT_MAX_POOL_CHUNKS
    qa_agent_max_tool_hits: int = constants.QA_AGENT_MAX_TOOL_HITS
    qa_agent_max_excerpt_tokens: int = constants.QA_AGENT_MAX_EXCERPT_TOKENS
    qa_agent_excerpt_overlap_fused_scale: float = (
        constants.QA_AGENT_EXCERPT_OVERLAP_FUSED_SCALE
    )
    qa_agent_planner_timeout_seconds: float = constants.QA_AGENT_PLANNER_TIMEOUT_SECONDS
    qa_agent_final_timeout_seconds: float = constants.QA_AGENT_FINAL_TIMEOUT_SECONDS
    # Follow-up QA context (ADR 0028): toggle in .env.example; seed caps from constants.
    qa_followup_context_enabled: bool = True
    qa_followup_max_seed_citations: int = constants.QA_FOLLOWUP_MAX_SEED_CITATIONS
    qa_followup_max_graph_expands: int = constants.QA_FOLLOWUP_MAX_GRAPH_EXPANDS
    # QA playbooks (ADR 0027) — env-overridable; defaults from constants (not in .env.example).
    qa_playbook_max_per_project: int = constants.QA_PLAYBOOK_MAX_PER_PROJECT
    qa_playbook_min_similarity: float = constants.QA_PLAYBOOK_MIN_SIMILARITY
    qa_playbook_merge_similarity: float = constants.QA_PLAYBOOK_MERGE_SIMILARITY
    qa_playbook_learning_enabled: bool = constants.QA_PLAYBOOK_LEARNING_ENABLED
    qa_playbook_warm_start_enabled: bool = constants.QA_PLAYBOOK_WARM_START_ENABLED
    qa_playbook_warm_start_similarity: float = constants.QA_PLAYBOOK_WARM_START_SIMILARITY
    sync_max_file_bytes: int = constants.SYNC_MAX_FILE_BYTES

    # Per-deploy toggle documented in ``.env.example``; interval is a constant.
    freshness_poll_enabled: bool = True
    freshness_poll_interval_seconds: int = constants.FRESHNESS_POLL_INTERVAL_SECONDS

    vllm_distill_model: str = ""
    distill_graph_max_depth: int = constants.DISTILL_GRAPH_MAX_DEPTH
    distill_max_entrypoints: int = constants.DISTILL_MAX_ENTRYPOINTS
    distill_batch_size: int = constants.DISTILL_BATCH_SIZE
    distill_min_confidence: float = constants.DISTILL_MIN_CONFIDENCE
    distill_heuristic_confidence: float = constants.DISTILL_HEURISTIC_CONFIDENCE


def load_settings() -> Settings:
    """Construct settings from env vars and ``.env`` files.

    Environment variables override values from files. Under pytest, only
    explicit env vars are used (no ``.env`` file loading).

    @returns Loaded application settings.
    """
    env_files = resolve_env_files()
    if env_files:
        return Settings(_env_file=env_files, _env_file_encoding="utf-8")
    return Settings()
