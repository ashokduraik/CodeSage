import pytest

from config import load_settings


def test_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("REPO_CLONE_DIR", raising=False)
    settings = load_settings()
    assert settings.database_url.startswith("postgresql://")
    assert settings.repo_clone_dir == "/var/codesage/repos"


def test_env_overrides(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pw@db:5432/test")
    monkeypatch.setenv("REPO_CLONE_DIR", "/tmp/repos")
    monkeypatch.setenv("EMBEDDING_DIMENSION", "512")
    settings = load_settings()
    assert settings.database_url == "postgresql://user:pw@db:5432/test"
    assert settings.repo_clone_dir == "/tmp/repos"
    assert settings.embedding_dimension == 512
