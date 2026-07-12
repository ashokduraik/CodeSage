"""Tests for indexing log configuration and redaction."""

from __future__ import annotations

import logging

import pytest

from config import Settings
from config.logging import (
    INDEXING_LOGGER_NAME,
    IndexingContext,
    configure_logging,
    format_indexing_context,
    format_job_claim_message,
    format_pending_queue_message,
    log_event,
    parse_progress_message,
    safe_repo_label,
    sanitize_log_message,
    short_commit,
    should_log_parse_milestone,
)


def test_sanitize_log_message_redacts_github_token() -> None:
    raw = "auth failed for https://ghp_secrettoken@github.com/org/repo"
    assert "ghp_" not in sanitize_log_message(raw)
    assert "[redacted]" in sanitize_log_message(raw)


def test_sanitize_log_message_redacts_gitlab_token() -> None:
    raw = "bad token glpat-abcdef123456"
    assert "glpat-" not in sanitize_log_message(raw)
    assert "[redacted]" in sanitize_log_message(raw)


def test_sanitize_log_message_truncates() -> None:
    assert len(sanitize_log_message("x" * 1000, max_len=100)) == 100


def test_safe_repo_label_strips_credentials_and_git_suffix() -> None:
    label = safe_repo_label("https://github.com/org/my-repo.git")
    assert label == "github.com/org/my-repo"
    assert "@" not in label


def test_short_commit() -> None:
    assert short_commit("abcdef123456") == "abcdef1"
    assert short_commit("") == "unknown"


def test_sanitize_log_message_redacts_authed_https_url() -> None:
    raw = "git clone failed: https://mytoken@github.com/org/repo.git"
    cleaned = sanitize_log_message(raw)
    assert "mytoken" not in cleaned
    assert "[redacted]" in cleaned


def test_format_indexing_context_with_project() -> None:
    ctx = IndexingContext(
        project_name="My App",
        repo_label="github.com/org/repo",
        branch="main",
    )
    assert format_indexing_context(ctx) == (
        'project "My App" / repo github.com/org/repo (branch main)'
    )


def test_format_job_claim_message() -> None:
    ctx = IndexingContext(project_name="P", repo_label="github.com/a/b", branch="dev")
    msg = format_job_claim_message(ctx, 1, "downloading repository")
    assert "Job claimed" in msg
    assert "Step 1/3" in msg


def test_should_log_parse_milestone() -> None:
    assert should_log_parse_milestone(10, 42) is True
    assert should_log_parse_milestone(5, 42) is False
    assert should_log_parse_milestone(42, 42) is True


def test_parse_progress_message() -> None:
    assert "10 of 42" in parse_progress_message(10, 42)


def test_format_pending_queue_message_empty() -> None:
    assert "empty" in format_pending_queue_message([])


def test_format_pending_queue_message_with_jobs() -> None:
    msg = format_pending_queue_message([("sync", 1)])
    assert "1 pending" in msg
    assert "sync" in msg


def test_job_step_maps_known_types() -> None:
    from config.logging import job_step, sync_step_name

    assert job_step("sync") == (1, "syncing repository")
    assert job_step("parse") == (2, "reading source files")
    assert job_step("embed") == (3, "making code searchable")
    assert sync_step_name(False) == "cloning repository"
    assert sync_step_name(True) == "fetching latest changes"


def test_format_orphaned_reclaimed_jobs_message() -> None:
    from config.logging import format_orphaned_reclaimed_jobs_message

    msg = format_orphaned_reclaimed_jobs_message(3)
    assert "3" in msg
    assert "orphaned" in msg


def test_configure_logging_sets_indexing_logger(capsys: pytest.CaptureFixture[str]) -> None:
    configure_logging(Settings(log_level="info"))
    logger = logging.getLogger(INDEXING_LOGGER_NAME)
    assert logger.level == logging.INFO
    log_event(logger, logging.INFO, "Test indexing message")
    captured = capsys.readouterr()
    assert "Test indexing message" in captured.err
    assert "[ENGINE]" in captured.err


def test_configure_logging_applies_uniform_format_to_uvicorn(capsys: pytest.CaptureFixture[str]) -> None:
    configure_logging(Settings(log_level="info"))
    logging.getLogger("uvicorn").info("Application startup complete.")
    captured = capsys.readouterr()
    assert "[ENGINE]" in captured.err
    assert "Application startup complete." in captured.err
    assert captured.err.startswith("20")  # ISO date prefix


def test_log_level_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LOG_LEVEL", "debug")
    from config import load_settings

    configure_logging(load_settings())
    logger = logging.getLogger(INDEXING_LOGGER_NAME)
    assert logger.level == logging.DEBUG
