"""Settings and environment access for CodeSage Python services."""

from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_EMBEDDING_DIMENSION = 1024


class Settings(BaseSettings):
    """Application settings, read from the environment (see .env.example)."""

    model_config = SettingsConfigDict(env_prefix="", extra="ignore")

    database_url: str = "postgresql://codesage:change-me@localhost:5432/codesage"
    repo_clone_dir: str = "/var/codesage/repos"
    embedding_dimension: int = DEFAULT_EMBEDDING_DIMENSION

    token_enc_key: str = ""
    worker_poll_seconds: float = 2.0
    worker_idle_seconds: float = 1.0

    tei_base_url: str = ""
    tei_embed_model: str = ""
    vllm_base_url: str = ""
    vllm_model: str = ""

    retrieval_top_k: int = 8
    retrieval_max_distance: float = 0.55
    sync_max_file_bytes: int = 512_000


def load_settings() -> Settings:
    """Construct settings from the current environment."""
    return Settings()
