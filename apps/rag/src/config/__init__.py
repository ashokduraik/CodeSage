"""Settings and environment access for CodeSage Python services."""

from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_EMBEDDING_DIMENSION = 1024


class Settings(BaseSettings):
    """Application settings, read from the environment (see .env.example)."""

    model_config = SettingsConfigDict(env_prefix="", extra="ignore")

    database_url: str = "postgresql://codesage:change-me@localhost:5432/codesage"
    repo_clone_dir: str = "/var/codesage/repos"
    embedding_dimension: int = DEFAULT_EMBEDDING_DIMENSION


def load_settings() -> Settings:
    """Construct settings from the current environment."""
    return Settings()
