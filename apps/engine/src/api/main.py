"""Engine service entrypoint."""

import logging
import sys
import threading
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI

from api.error_handlers import register_exception_handlers
from api.routes.query import router as query_router
from config import load_settings
from config.logging import configure_logging, get_indexing_logger, log_event
from config.service_users import assert_service_users_exist
from config.startup import StartupConfigurationError, validate_settings, verify_database_connection
from repositories import create_engine_from_settings, create_session_factory
from services.health import get_planner_tools_health, log_model_backend_status
from services.indexing.startup_log import log_startup_queue_state
from workers.freshness_poller import run_freshness_poll_loop
from workers.worker import run_worker_loop

_settings = load_settings()
configure_logging(_settings)
_logger = get_indexing_logger()


def create_app() -> FastAPI:
    """Create and configure the FastAPI application for the engine service.

    Validates settings and database connectivity before any HTTP traffic is accepted.
    A background daemon thread polls the Postgres job queue for indexing work
    (sync → parse → embed) for the lifetime of the process.

    @returns Configured FastAPI instance with health check and ``/engine/query`` routes.
    """
    settings = _settings
    # Catch misconfiguration at startup — operators should see a clear boot failure,
    # not a 500 on the first real request after deploy.
    validate_settings(settings)
    engine = create_engine_from_settings(settings)
    verify_database_connection(settings, engine)
    session_factory = create_session_factory(engine)
    with session_factory() as session:
        # Jobs are stamped with engine service-user ids; those rows must exist before enqueue.
        assert_service_users_exist(session)

    stop_event = threading.Event()
    worker_thread: threading.Thread | None = None
    poll_thread: threading.Thread | None = None

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        """Manage the background indexing worker for the lifetime of the HTTP server.

        Starts the job consumer when uvicorn boots and signals it to stop on shutdown.
        Logs queue state once at startup so operators can see pending or failed work.

        @yields Control to the running FastAPI app between startup and shutdown hooks.
        """
        nonlocal worker_thread, poll_thread
        # Run the worker in a daemon thread so the process can exit when uvicorn stops.
        # A non-daemon thread would keep the interpreter alive after the server shuts down.
        worker_thread = threading.Thread(
            target=run_worker_loop,
            args=(settings, stop_event),
            name="codesage-engine-worker",
            daemon=True,
        )
        worker_thread.start()
        if settings.freshness_poll_enabled:
            poll_thread = threading.Thread(
                target=run_freshness_poll_loop,
                args=(settings, stop_event, session_factory),
                name="codesage-freshness-poller",
                daemon=True,
            )
            poll_thread.start()
        log_event(
            _logger,
            logging.INFO,
            "Engine service started — background indexing worker is running",
        )
        log_startup_queue_state(settings, session_factory)
        # Non-fatal: warns when a model backend is down/model missing, never aborts boot.
        log_model_backend_status(settings)
        yield
        stop_event.set()
        if worker_thread is not None:
            # Give the worker up to five seconds to finish its current job after stop_event.
            # We do not wait indefinitely — a hung handler must not block process exit.
            worker_thread.join(timeout=5)
        if poll_thread is not None:
            poll_thread.join(timeout=5)
        log_event(_logger, logging.INFO, "Engine service shutting down")
        # Return SQLAlchemy pool connections to Postgres after the worker thread is stopped.
        engine.dispose()

    app = FastAPI(title="CodeSage Engine", version="0.1.0", lifespan=lifespan)
    app.state.settings = settings
    app.state.session_factory = session_factory
    register_exception_handlers(app)

    @app.get("/health")
    def health() -> dict[str, str]:
        """Answer load-balancer and orchestrator liveness probes.

        Intentionally does not hit the database — probes should stay cheap and must not
        fail when Postgres is momentarily unreachable during a rolling restart.
        ``plannerTools`` reflects the last startup probe (ok|unsupported), not a live
        LLM call on each request.

        @returns JSON with service name, ``ok`` status, and planner tool-support flag.
        """
        return {
            "status": "ok",
            "service": "engine",
            "plannerTools": get_planner_tools_health(),
        }

    app.include_router(query_router)
    return app


_app: FastAPI | None = None


def __getattr__(name: str) -> FastAPI:
    """Lazy-load the module-level ASGI app on first access.

    Tests import ``create_app`` directly and build a fresh app without triggering
    database validation. Production uvicorn imports ``api.main:app``, which is created
    here on first attribute access.

    @param name - Attribute name requested on this module.
    @returns The singleton FastAPI application.
    @raises AttributeError when ``name`` is not ``app``.
    """
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
