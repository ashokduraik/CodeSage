"""Settings and environment access for CodeSage Python services."""

from __future__ import annotations

import os
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_EMBEDDING_DIMENSION = 1024

_RAG_ROOT = Path(__file__).resolve().parents[2]
_MONOREPO_ROOT = _RAG_ROOT.parents[1]


def resolve_env_files() -> tuple[Path, ...]:
    """Return ``.env`` files to load, lowest priority first.

    Skips file loading under pytest so tests control env via ``monkeypatch``.
    Loads repo-root ``.env`` then ``apps/rag/.env`` (RAG file wins on conflicts).

    @returns Tuple of existing env file paths.
    """
    if os.getenv("PYTEST_CURRENT_TEST"):
        return ()
    candidates = (_MONOREPO_ROOT / ".env", _RAG_ROOT / ".env")
    return tuple(path for path in candidates if path.is_file())


class Settings(BaseSettings):
    """Application settings, read from the environment (see .env.example)."""

    model_config = SettingsConfigDict(env_prefix="", extra="ignore")

    database_url: str = "postgresql://codesage:change-me@localhost:5432/codesage"
    repo_clone_dir: str = "/var/codesage/repos"
    embedding_dimension: int = DEFAULT_EMBEDDING_DIMENSION

    token_enc_key: str = ""
    log_level: str = "info"
    worker_poll_seconds: float = 2.0
    worker_idle_seconds: float = 10.0
    worker_stale_job_seconds: int = 600
    worker_max_job_attempts: int = 3

    tei_base_url: str = ""
    tei_embed_model: str = ""
    embedding_timeout_seconds: float = 300.0
    vllm_base_url: str = ""
    vllm_model: str = ""
    llm_timeout_seconds: float = 300.0
    startup_probe_timeout_seconds: float = 5.0

    # Context window sizing: the LLM prompt is packed to fill the connected model's
    # context. When auto-detection fails, ``llm_max_context_tokens`` is the fallback,
    # and ``llm_completion_reserve_tokens`` is held back for the generated answer.
    llm_context_detect_enabled: bool = True
    llm_max_context_tokens: int = 8192
    llm_completion_reserve_tokens: int = 1024
    llm_max_history_turns: int = 10

    retrieval_top_k: int = 20
    retrieval_vector_top_k: int = 12
    retrieval_keyword_top_k: int = 12
    retrieval_symbol_top_k: int = 12
    retrieval_fused_top_k: int = 20
    retrieval_rrf_k: int = 60
    retrieval_vector_weight: float = 1.0
    retrieval_keyword_weight: float = 2.0
    retrieval_symbol_weight: float = 3.0
    retrieval_keyword_min_similarity: float = 0.15
    retrieval_symbol_min_similarity: float = 0.35
    retrieval_max_distance: float = 0.45
    retrieval_context_top_k: int = 10
    retrieval_min_confidence: float = 0.45
    retrieval_adaptive_medium_min_chunks: int = 5000
    retrieval_adaptive_large_min_chunks: int = 50000
    retrieval_confidence_weight_retrieval: float = 0.40
    retrieval_confidence_weight_graph: float = 0.30
    retrieval_confidence_weight_symbol: float = 0.20
    retrieval_confidence_weight_coverage: float = 0.10
    retrieval_min_distinct_files: int = 1
    retrieval_graph_enabled: bool = True
    retrieval_graph_max_depth: int = 2
    retrieval_graph_max_extra_chunks: int = 4
    retrieval_reranker_enabled: bool = False
    retrieval_reranker_base_url: str = ""
    retrieval_reranker_model: str = "BAAI/bge-reranker-v2-m3"
    retrieval_reranker_input_k: int = 25
    retrieval_reranker_output_k: int = 8
    retrieval_reranker_timeout_seconds: float = 30.0
    retrieval_reranker_max_doc_chars: int = 1500
    sync_max_file_bytes: int = 512_000

    freshness_poll_enabled: bool = True
    freshness_poll_interval_seconds: int = 900


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
