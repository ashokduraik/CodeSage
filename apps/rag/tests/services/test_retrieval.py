"""Tests for retrieval helpers."""

import uuid
from unittest.mock import MagicMock

import pytest

from config import Settings
from services.retrieval.search import is_confident_match, retrieve_code_chunks


def test_is_confident_match_empty() -> None:
    assert is_confident_match(Settings(), []) is False


def test_is_confident_match_threshold() -> None:
    chunk = MagicMock()
    settings = Settings(retrieval_max_distance=0.5)
    assert is_confident_match(settings, [(chunk, 0.4)]) is True
    assert is_confident_match(settings, [(chunk, 0.9)]) is False


def test_retrieve_code_chunks_missing_project(monkeypatch: pytest.MonkeyPatch) -> None:
    repo = MagicMock()
    repo.get_by_id.return_value = None
    monkeypatch.setattr(
        "services.retrieval.search.ProjectRepository",
        lambda session: repo,
    )
    with pytest.raises(ValueError, match="Project not found"):
        retrieve_code_chunks(
            MagicMock(),
            Settings(),
            project_id=uuid.uuid4(),
            question="q",
        )
