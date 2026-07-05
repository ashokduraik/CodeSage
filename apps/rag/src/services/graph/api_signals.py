"""Extract HTTP client calls and server route declarations from JS/TS source."""

from __future__ import annotations

import re
from dataclasses import dataclass

HTTP_METHODS: frozenset[str] = frozenset({"GET", "POST", "PUT", "PATCH", "DELETE"})

_AXIOS_PATTERN = re.compile(
    r"\baxios\.(get|post|put|patch|delete)\s*\(\s*['\"]([^'\"]+)['\"]",
    re.IGNORECASE,
)
_FETCH_PATTERN = re.compile(
    r"\bfetch\s*\(\s*['\"]([^'\"]+)['\"]",
    re.IGNORECASE,
)
_HTTP_CLIENT_PATTERN = re.compile(
    r"\.http\.(get|post|put|patch|delete)\s*\(\s*['\"]([^'\"]+)['\"]",
    re.IGNORECASE,
)
_ROUTE_PATTERN = re.compile(
    r"\b(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*['\"]([^'\"]+)['\"]",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class ApiSignal:
    """One HTTP call site or Express-style route declaration."""

    kind: str
    method: str
    path: str
    start_line: int
    end_line: int

    @property
    def key(self) -> str:
        """Stable match key used by the cross-repo link resolver."""
        return f"{self.method} {self.path}"


def normalize_api_path(raw_path: str) -> str | None:
    """Normalize a relative API path for cross-repo matching.

    Only relative paths starting with ``/`` are kept so host-specific URLs do not
    pollute the resolver. Trailing slashes are removed for stable keys.

    @param raw_path - Path literal extracted from source.
    @returns Normalized path or ``None`` when the value is not a relative API path.
    """
    path = raw_path.strip()
    if not path.startswith("/"):
        return None
    if len(path) > 1 and path.endswith("/"):
        path = path.rstrip("/")
    return path


def _line_number(content: str, index: int) -> int:
    """Return the 1-based line number for a byte offset in ``content``."""
    return content[:index].count("\n") + 1


def _append_signal(
    signals: list[ApiSignal],
    *,
    kind: str,
    method: str,
    raw_path: str,
    content: str,
    match_start: int,
    match_end: int,
) -> None:
    """Append one signal when ``raw_path`` normalizes to a relative API path."""
    path = normalize_api_path(raw_path)
    if path is None:
        return
    normalized_method = method.upper()
    if normalized_method not in HTTP_METHODS:
        return
    start_line = _line_number(content, match_start)
    end_line = _line_number(content, match_end)
    signals.append(
        ApiSignal(
            kind=kind,
            method=normalized_method,
            path=path,
            start_line=start_line,
            end_line=end_line,
        ),
    )


def extract_api_signals(content: str, file_path: str) -> list[ApiSignal]:
    """Find HTTP calls and Express routes in one JS/TS file.

    Uses lightweight regex extraction during parse so the cross-repo resolver can
    match frontend client calls to backend route declarations by method and path.

    @param content - Full file text.
    @param file_path - Repo-relative path (used to skip non-JS/TS files).
    @returns Deduplicated API signals sorted by source position.
    """
    suffix = file_path.lower().rsplit(".", maxsplit=1)[-1] if "." in file_path else ""
    if suffix not in {"js", "jsx", "ts", "tsx", "mjs", "cjs"}:
        return []

    signals: list[ApiSignal] = []
    seen: set[tuple[str, str, int]] = set()

    for match in _AXIOS_PATTERN.finditer(content):
        _append_signal(
            signals,
            kind="http_call",
            method=match.group(1),
            raw_path=match.group(2),
            content=content,
            match_start=match.start(),
            match_end=match.end(),
        )

    for match in _HTTP_CLIENT_PATTERN.finditer(content):
        _append_signal(
            signals,
            kind="http_call",
            method=match.group(1),
            raw_path=match.group(2),
            content=content,
            match_start=match.start(),
            match_end=match.end(),
        )

    for match in _FETCH_PATTERN.finditer(content):
        _append_signal(
            signals,
            kind="http_call",
            method="GET",
            raw_path=match.group(1),
            content=content,
            match_start=match.start(),
            match_end=match.end(),
        )

    for match in _ROUTE_PATTERN.finditer(content):
        _append_signal(
            signals,
            kind="route",
            method=match.group(1),
            raw_path=match.group(2),
            content=content,
            match_start=match.start(),
            match_end=match.end(),
        )

    deduped: list[ApiSignal] = []
    for signal in signals:
        key = (signal.kind, signal.key, signal.start_line)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(signal)
    return deduped
