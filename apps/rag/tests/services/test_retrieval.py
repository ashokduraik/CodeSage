"""Tests for retrieval helpers."""

import uuid
from unittest.mock import MagicMock

import pytest

from config import Settings
from services.retrieval.calibration import (
    BORDERLINE_WEAK_MATCH_DISTANCE,
    CALIBRATED_MAX_DISTANCE,
    GENERIC_GREETING_MATCH_DISTANCE,
    STRONG_CODE_MATCH_DISTANCE,
)
from services.retrieval.search import is_confident_match, retrieve_code_chunks


def test_is_confident_match_empty() -> None:
    assert is_confident_match(Settings(), []) is False


def test_is_confident_match_threshold() -> None:
    chunk = MagicMock()
    settings = Settings(retrieval_max_distance=0.5)
    assert is_confident_match(settings, [(chunk, 0.4)]) is True
    assert is_confident_match(settings, [(chunk, 0.9)]) is False


def test_calibrated_threshold_passes_strong_matches() -> None:
    chunk = MagicMock()
    settings = Settings(retrieval_max_distance=CALIBRATED_MAX_DISTANCE)
    assert is_confident_match(settings, [(chunk, STRONG_CODE_MATCH_DISTANCE)]) is True


def test_calibrated_threshold_rejects_borderline_and_greeting_matches() -> None:
    chunk = MagicMock()
    settings = Settings(retrieval_max_distance=CALIBRATED_MAX_DISTANCE)
    assert is_confident_match(settings, [(chunk, BORDERLINE_WEAK_MATCH_DISTANCE)]) is False
    assert is_confident_match(settings, [(chunk, GENERIC_GREETING_MATCH_DISTANCE)]) is False


def test_default_settings_use_calibrated_threshold() -> None:
    assert Settings().retrieval_max_distance == CALIBRATED_MAX_DISTANCE


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


def test_retrieve_code_chunks_returns_matches(monkeypatch: pytest.MonkeyPatch) -> None:
    project = MagicMock()
    project_repo = MagicMock()
    project_repo.get_by_id.return_value = project
    chunk = MagicMock()
    monkeypatch.setattr(
        "services.retrieval.search.ProjectRepository",
        lambda session: project_repo,
    )
    monkeypatch.setattr(
        "services.retrieval.search.EmbeddingClient",
        lambda settings: MagicMock(embed_texts=lambda texts: [[0.1]]),
    )
    monkeypatch.setattr(
        "services.retrieval.search.similarity_search",
        lambda *a, **k: [(chunk, 0.2)],
    )
    monkeypatch.setattr(
        "services.retrieval.search.augment_matches_with_graph",
        lambda session, settings, *, project_id, matches: matches,
    )
    matches = retrieve_code_chunks(
        MagicMock(),
        Settings(),
        project_id=uuid.uuid4(),
        question="where?",
    )
    assert matches == [(chunk, 0.2)]
