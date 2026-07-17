import pytest

from config import Settings, load_settings, resolve_env_files
from config import constants


def test_resolve_env_files_skips_under_pytest() -> None:
    assert resolve_env_files() == ()


def test_load_settings_reads_env_file(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    env_file = tmp_path / ".env"
    env_file.write_text(
        "DATABASE_URL=postgresql://myuser:mypass@db:5432/mydb\nREPO_CLONE_DIR=/tmp/clones\n",
        encoding="utf-8",
    )
    settings = Settings(_env_file=env_file, _env_file_encoding="utf-8")
    assert settings.database_url == "postgresql://myuser:mypass@db:5432/mydb"
    assert settings.repo_clone_dir == "/tmp/clones"


def test_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("REPO_CLONE_DIR", raising=False)
    settings = load_settings()
    assert settings.database_url.startswith("postgresql://")
    assert settings.repo_clone_dir == "/var/codesage/repos"
    assert settings.worker_idle_seconds == 10.0
    assert settings.worker_stale_job_seconds == 600
    assert settings.worker_max_job_attempts == 3
    assert settings.log_level == "info"


def test_env_overrides(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pw@db:5432/test")
    monkeypatch.setenv("REPO_CLONE_DIR", "/tmp/repos")
    monkeypatch.setenv("EMBEDDING_DIMENSION", "512")
    monkeypatch.setenv("TOKEN_ENC_KEY", "")
    monkeypatch.setenv("TEI_BASE_URL", "http://tei")
    settings = load_settings()
    assert settings.database_url == "postgresql://user:pw@db:5432/test"
    assert settings.repo_clone_dir == "/tmp/repos"
    assert settings.embedding_dimension == 512
    assert settings.tei_base_url == "http://tei"


def test_tuning_defaults_come_from_constants(monkeypatch: pytest.MonkeyPatch) -> None:
    """Tuning fields read their default from ``constants`` so there is one source of truth."""
    monkeypatch.delenv("RETRIEVAL_VECTOR_TOP_K", raising=False)
    monkeypatch.delenv("QA_AGENT_MAX_ITERATIONS", raising=False)
    monkeypatch.delenv("QA_AGENT_MIN_CONFIDENCE", raising=False)
    monkeypatch.delenv("QA_PLAYBOOK_MAX_PER_PROJECT", raising=False)
    monkeypatch.delenv("QA_PLAYBOOK_LEARNING_ENABLED", raising=False)
    monkeypatch.delenv("QA_PLAYBOOK_WARM_START_ENABLED", raising=False)
    monkeypatch.delenv("RETRIEVAL_ADAPTIVE_XLARGE_MIN_CHUNKS", raising=False)
    settings = load_settings()
    assert settings.retrieval_vector_top_k == constants.RETRIEVAL_VECTOR_TOP_K
    assert settings.sync_max_file_bytes == constants.SYNC_MAX_FILE_BYTES
    assert settings.freshness_poll_interval_seconds == constants.FRESHNESS_POLL_INTERVAL_SECONDS
    assert settings.qa_agent_max_iterations == constants.QA_AGENT_MAX_ITERATIONS
    assert settings.qa_agent_min_confidence == constants.QA_AGENT_MIN_CONFIDENCE
    assert settings.qa_agent_confidence_top_n == constants.QA_AGENT_CONFIDENCE_TOP_N
    assert settings.qa_agent_max_pool_chunks == constants.QA_AGENT_MAX_POOL_CHUNKS
    assert settings.qa_agent_max_tool_hits == constants.QA_AGENT_MAX_TOOL_HITS
    assert settings.qa_agent_max_excerpt_tokens == constants.QA_AGENT_MAX_EXCERPT_TOKENS
    assert settings.qa_agent_planner_timeout_seconds == constants.QA_AGENT_PLANNER_TIMEOUT_SECONDS
    assert settings.qa_agent_final_timeout_seconds == constants.QA_AGENT_FINAL_TIMEOUT_SECONDS
    assert settings.qa_playbook_max_per_project == constants.QA_PLAYBOOK_MAX_PER_PROJECT
    assert settings.qa_playbook_min_similarity == constants.QA_PLAYBOOK_MIN_SIMILARITY
    assert settings.qa_playbook_merge_similarity == constants.QA_PLAYBOOK_MERGE_SIMILARITY
    assert settings.qa_playbook_learning_enabled == constants.QA_PLAYBOOK_LEARNING_ENABLED
    assert settings.qa_playbook_warm_start_enabled == constants.QA_PLAYBOOK_WARM_START_ENABLED
    assert (
        settings.qa_playbook_warm_start_similarity
        == constants.QA_PLAYBOOK_WARM_START_SIMILARITY
    )
    assert constants.QA_PLAYBOOK_WARM_START_ENABLED is False
    assert (
        settings.retrieval_adaptive_xlarge_min_chunks
        == constants.RETRIEVAL_ADAPTIVE_XLARGE_MIN_CHUNKS
    )
    assert settings.retrieval_vector_top_k_xlarge == constants.RETRIEVAL_VECTOR_TOP_K_XLARGE
    assert not hasattr(settings, "retrieval_graph_enabled")


def test_qa_agent_constants_still_env_overridable(monkeypatch: pytest.MonkeyPatch) -> None:
    """Agent QA tuning defaults can still be overridden by env when required."""
    monkeypatch.setenv("QA_AGENT_MAX_ITERATIONS", "3")
    monkeypatch.setenv("QA_AGENT_MIN_CONFIDENCE", "0.9")
    settings = load_settings()
    assert settings.qa_agent_max_iterations == 3
    assert settings.qa_agent_min_confidence == 0.9


def test_constants_still_env_overridable(monkeypatch: pytest.MonkeyPatch) -> None:
    """A constant-backed default can still be overridden by an env var when required."""
    monkeypatch.setenv("RETRIEVAL_VECTOR_TOP_K", "99")
    settings = load_settings()
    assert settings.retrieval_vector_top_k == 99
