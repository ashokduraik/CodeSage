"""RAG service entrypoint."""

import logging
import sys
import threading
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI

from api.routes.query import router as query_router
from config import load_settings
from config.logging import configure_logging, get_indexing_logger, log_event
from config.service_users import assert_service_users_exist
from config.startup import StartupConfigurationError, validate_settings, verify_database_connection
from repositories import create_engine_from_settings, create_session_factory
from services.indexing.startup_log import log_startup_queue_state
from workers.worker import run_worker_loop

_settings = load_settings()
configure_logging(_settings)
_logger = get_indexing_logger()


def create_app() -> FastAPI:
    """Create the FastAPI app with a background job-consumer thread."""
    settings = _settings
    validate_settings(settings)
    engine = create_engine_from_settings(settings)
    verify_database_connection(settings, engine)
    session_factory = create_session_factory(engine)
    with session_factory() as session:
        assert_service_users_exist(session)

    stop_event = threading.Event()
    worker_thread: threading.Thread | None = None

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        nonlocal worker_thread
        worker_thread = threading.Thread(
            target=run_worker_loop,
            args=(settings, stop_event),
            name="codesage-rag-worker",
            daemon=True,
        )
        worker_thread.start()
        log_event(
            _logger,
            logging.INFO,
            "RAG service started — background indexing worker is running",
        )
        log_startup_queue_state(settings, session_factory)
        yield
        stop_event.set()
        if worker_thread is not None:
            worker_thread.join(timeout=5)
        log_event(_logger, logging.INFO, "RAG service shutting down")
        engine.dispose()

    app = FastAPI(title="CodeSage RAG", version="0.1.0", lifespan=lifespan)
    app.state.settings = settings
    app.state.session_factory = session_factory

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "service": "rag"}

    app.include_router(query_router)
    return app


_app: FastAPI | None = None


def __getattr__(name: str) -> FastAPI:
    """Lazy-load the ASGI app so importing ``create_app`` in tests skips DB checks."""
    if name == "app":
        global _app
        if _app is None:
            try:
                _app = create_app()
            except StartupConfigurationError as exc:
                log_event(_logger, logging.ERROR, str(exc))
                sys.exit(1)
        return _app
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
