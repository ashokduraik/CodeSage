"""Tests for the RAG uvicorn entrypoint."""

from __future__ import annotations

import sys
from unittest.mock import patch

from api.run import main


def test_main_starts_uvicorn_with_uniform_logging() -> None:
    argv = ["api.run", "--reload", "--host", "127.0.0.1", "--port", "8001"]
    with (
        patch.object(sys, "argv", argv),
        patch("api.run.configure_logging") as mock_configure,
        patch("api.run.load_settings") as mock_load,
        patch("api.run.uvicorn.run") as mock_run,
    ):
        main()

    mock_load.assert_called_once()
    mock_configure.assert_called_once_with(mock_load.return_value)
    mock_run.assert_called_once_with(
        "api.main:app",
        host="127.0.0.1",
        port=8001,
        reload=True,
        log_config=None,
    )
