"""Tests for user-facing progress message builders."""

from __future__ import annotations

from config.logging import IndexingContext
from services.indexing.progress_messages import finished_sync_message, started_message


def test_started_message_webhook_trigger_suffix() -> None:
    ctx = IndexingContext(
        project_name="App",
        repo_label="github.com/org/repo",
        branch="main",
    )
    msg = started_message("sync", ctx, fallback="repo x", trigger="webhook_push")
    assert "new commit pushed" in msg
    assert "github.com/org/repo" in msg
    assert "ghp_" not in msg


def test_started_message_parse_includes_file_count() -> None:
    ctx = IndexingContext(project_name=None, repo_label="github.com/org/repo")
    msg = started_message("parse", ctx, fallback="repo x", file_count=12)
    assert "12 source files" in msg


def test_started_message_sync_first_clone() -> None:
    ctx = IndexingContext(project_name=None, repo_label="github.com/org/repo")
    msg = started_message("sync", ctx, fallback="repo x", sync_is_update=False)
    assert "Cloning repository" in msg
    assert "Fetching" not in msg


def test_started_message_sync_fetch_update() -> None:
    ctx = IndexingContext(project_name=None, repo_label="github.com/org/repo")
    msg = started_message(
        "sync",
        ctx,
        fallback="repo x",
        trigger="manual_sync",
        sync_is_update=True,
    )
    assert "Fetching latest changes" in msg
    assert "manual re-index" in msg


def test_started_message_distill() -> None:
    msg = started_message("distill", None, fallback="project")
    assert msg == "Building project knowledge from indexed code"


def test_finished_distill_message_includes_counts() -> None:
    from services.indexing.progress_messages import finished_distill_message

    msg = finished_distill_message(
        workflows=1,
        page_map=2,
        permission_rules=0,
        data_flows=3,
    )
    assert "1 workflows" in msg
    assert "2 pages" in msg
    assert "0 permissions" in msg
    assert "3 data flows" in msg
