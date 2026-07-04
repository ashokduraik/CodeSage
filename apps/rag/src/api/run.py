"""Dev/production entrypoint for the RAG service with unified logging."""

from __future__ import annotations

import argparse

import uvicorn

from config import load_settings
from config.logging import configure_logging


def main() -> None:
    """Start uvicorn with RAG logging configured before the server boots.

    Uses ``log_config=None`` so uvicorn does not override the unified format.
    """
    parser = argparse.ArgumentParser(description="Run the CodeSage RAG service.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8001)
    parser.add_argument("--reload", action="store_true", help="Enable auto-reload (dev only).")
    args = parser.parse_args()

    configure_logging(load_settings())
    uvicorn.run(
        "api.main:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        log_config=None,
    )


if __name__ == "__main__":
    main()
