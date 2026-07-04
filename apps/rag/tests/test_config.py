import pytest

from config import Settings, load_settings, resolve_env_files


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
