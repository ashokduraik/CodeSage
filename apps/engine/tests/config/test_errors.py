"""Tests for failure explanation helpers."""

from __future__ import annotations

import logging

import pytest

from config import Settings
from config.errors import explain_failure, format_failure_summary
from config.logging import INDEXING_LOGGER_NAME, configure_logging, log_failure


@pytest.fixture(autouse=True)
def _logging(caplog: pytest.LogCaptureFixture) -> None:
    configure_logging(Settings(log_level="info"))
    caplog.set_level(logging.ERROR, logger=INDEXING_LOGGER_NAME)


def test_explain_failure_tei_getaddrinfo() -> None:
    exc = RuntimeError("[Errno 11001] getaddrinfo failed")
    msg = explain_failure(
        exc,
        job_type="embed",
        settings=Settings(tei_base_url="http://tei:8080"),
    )
    assert "tei" in msg
    assert "Docker-only" in msg


def test_explain_failure_token_enc_key() -> None:
    exc = ValueError("TOKEN_ENC_KEY must decode to 32 bytes (got 6)")
    msg = explain_failure(exc, job_type="sync", settings=Settings())
    assert "TOKEN_ENC_KEY" in msg
    assert "apps/api" in msg


def test_explain_failure_repo_not_found() -> None:
    exc = ValueError("Repo not found: abc")
    msg = explain_failure(exc, job_type="sync", settings=Settings())
    assert "detached or deleted" in msg


def test_format_failure_summary_includes_job_type() -> None:
    line = format_failure_summary(
        "embed",
        'project "App" / repo github.com/org/repo',
        3,
        "making code searchable",
        "Embedding service unreachable",
        job_id="abcd1234",
    )
    assert "embed abcd1234" in line
    assert "Step 3/3" in line


def test_log_failure_emits_rag_traceback_lines(caplog: pytest.LogCaptureFixture) -> None:
    try:
        raise RuntimeError("boom")
    except RuntimeError as exc:
        log_failure(
            logging.getLogger(INDEXING_LOGGER_NAME),
            "Job failed — test",
            exc,
        )
    assert "Traceback" in caplog.text
    assert "RuntimeError" in caplog.text
