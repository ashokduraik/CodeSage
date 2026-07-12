"""Tests for the background freshness poll loop."""

from __future__ import annotations

import threading
from unittest.mock import MagicMock

import pytest

from config import Settings
from workers.freshness_poller import run_freshness_poll_loop, run_freshness_poll_pass


def test_run_freshness_poll_pass_returns_enqueued_count(monkeypatch: pytest.MonkeyPatch) -> None:
    session_factory = MagicMock()
    monkeypatch.setattr(
        "workers.freshness_poller.poll_stale_repos",
        lambda _factory, _settings: 2,
    )

    assert run_freshness_poll_pass(Settings(), session_factory) == 2


def test_run_freshness_poll_loop_disabled_does_not_poll(monkeypatch: pytest.MonkeyPatch) -> None:
    poll_pass = MagicMock()
    monkeypatch.setattr("workers.freshness_poller.run_freshness_poll_pass", poll_pass)

    run_freshness_poll_loop(
        Settings(freshness_poll_enabled=False),
        threading.Event(),
        MagicMock(),
    )

    poll_pass.assert_not_called()


def test_run_freshness_poll_loop_runs_immediately_on_startup(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    poll_pass = MagicMock(return_value=0)
    monkeypatch.setattr("workers.freshness_poller.run_freshness_poll_pass", poll_pass)

    stop_event = threading.Event()

    def stop_on_first_wait(timeout: float | None = None) -> bool:
        stop_event.set()
        return True

    monkeypatch.setattr(stop_event, "wait", stop_on_first_wait)

    run_freshness_poll_loop(
        Settings(freshness_poll_enabled=True, freshness_poll_interval_seconds=60),
        stop_event,
        MagicMock(),
    )

    poll_pass.assert_called_once()


def test_run_freshness_poll_loop_isolates_pass_failures(monkeypatch: pytest.MonkeyPatch) -> None:
    poll_pass = MagicMock(side_effect=[RuntimeError("db down"), 0])
    monkeypatch.setattr("workers.freshness_poller.run_freshness_poll_pass", poll_pass)

    stop_event = threading.Event()
    wait_calls = 0

    def stop_after_second_wait(timeout: float | None = None) -> bool:
        nonlocal wait_calls
        wait_calls += 1
        if wait_calls >= 2:
            stop_event.set()
            return True
        return False

    monkeypatch.setattr(stop_event, "wait", stop_after_second_wait)

    run_freshness_poll_loop(
        Settings(freshness_poll_enabled=True, freshness_poll_interval_seconds=1),
        stop_event,
        MagicMock(),
    )

    assert poll_pass.call_count == 2
