"""FastAPI global exception handlers returning EngineErrorResponse."""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from config.logging import get_indexing_logger, log_event, sanitize_log_message

_logger = get_indexing_logger()


def register_exception_handlers(app: FastAPI) -> None:
    """Register global FastAPI exception handlers for consistent error JSON.

    Mirrors Node ``setErrorHandler`` / Express ``app.use((err, …))``: every
    unhandled route error is logged and returned as ``EngineErrorResponse``
    ``{ "error": { "code", "message" } }``. Mid-stream SSE failures still need
    an explicit ``error`` chunk — these handlers only cover pre-stream JSON.

    @param app - FastAPI application to attach handlers to.
    """

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        _request: Request,
        exc: RequestValidationError,
    ) -> JSONResponse:
        """Map request validation failures to a 422 EngineErrorResponse.

        @param _request - Incoming request (unused; shape match required by FastAPI).
        @param exc - Pydantic/FastAPI validation error.
        @returns JSON body with VALIDATION_ERROR code.
        """
        message = sanitize_log_message(str(exc.errors()))
        return JSONResponse(
            status_code=422,
            content={"error": {"code": "VALIDATION_ERROR", "message": message}},
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(
        _request: Request,
        exc: StarletteHTTPException,
    ) -> JSONResponse:
        """Map HTTPException to EngineErrorResponse without leaking internals.

        @param _request - Incoming request.
        @param exc - Starlette/FastAPI HTTP exception.
        @returns JSON body with a status-derived code and the HTTP detail message.
        """
        code = "NOT_FOUND" if exc.status_code == 404 else "REQUEST_ERROR"
        if exc.status_code >= 500:
            code = "INTERNAL_ERROR"
        detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": code, "message": sanitize_log_message(detail)}},
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(
        request: Request,
        exc: Exception,
    ) -> JSONResponse:
        """Catch any unhandled exception, log it, and return a stable 500 body.

        @param request - Incoming request (path logged for triage).
        @param exc - Unexpected exception from a route or dependency.
        @returns JSON body with INTERNAL_ERROR and a non-leaking message.
        """
        log_event(
            _logger,
            logging.ERROR,
            f"Unhandled engine error on {request.method} {request.url.path}: "
            f"{sanitize_log_message(f'{type(exc).__name__}: {exc}')}",
        )
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": "INTERNAL_ERROR",
                    "message": "Internal server error",
                }
            },
        )
