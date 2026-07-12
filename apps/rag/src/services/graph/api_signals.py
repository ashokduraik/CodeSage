"""Extract HTTP client calls and server route declarations from JS/TS source."""

from __future__ import annotations

import re
from dataclasses import dataclass

HTTP_METHODS: frozenset[str] = frozenset({"GET", "POST", "PUT", "PATCH", "DELETE"})

_AXIOS_PATTERN = re.compile(
    r"\baxios\.(get|post|put|patch|delete)\s*\(\s*['\"]([^'\"]+)['\"]",
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
_FETCH_PATTERN = re.compile(r"\bfetch\s*\(", re.IGNORECASE)
_METHOD_PATTERN = re.compile(
    r"\bmethod\s*:\s*['\"](\w+)['\"]",
    re.IGNORECASE,
)
_STRING_LITERAL = re.compile(r"['\"]([^'\"]+)['\"]")


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


def _read_balanced_object(content: str, start_index: int) -> tuple[str, int] | None:
    """Read a ``{ ... }`` object starting at ``start_index``.

    @param content - Full file text.
    @param start_index - Index of the opening brace.
    @returns Object text and index after the closing brace.
    """
    if start_index >= len(content) or content[start_index] != "{":
        return None
    depth = 0
    index = start_index
    while index < len(content):
        char = content[index]
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return content[start_index : index + 1], index + 1
        index += 1
    return None


def _extract_fetch_method(options_text: str | None) -> str:
    """Parse an HTTP method from a fetch options object, defaulting to GET."""
    if not options_text:
        return "GET"
    match = _METHOD_PATTERN.search(options_text)
    if match is None:
        return "GET"
    return match.group(1).upper()


def _extract_fetch_calls(content: str) -> list[tuple[str, str, int, int]]:
    """Find ``fetch(url[, options])`` call sites with balanced option objects.

    @param content - Full file text.
    @returns Tuples of method, raw path, start index, end index.
    """
    results: list[tuple[str, str, int, int]] = []
    for match in _FETCH_PATTERN.finditer(content):
        open_paren = content.find("(", match.end() - 1)
        if open_paren < 0:
            continue
        cursor = open_paren + 1
        while cursor < len(content) and content[cursor].isspace():
            cursor += 1
        literal = _STRING_LITERAL.match(content, cursor)
        if literal is None:
            continue
        raw_path = literal.group(1)
        cursor = literal.end()
        while cursor < len(content) and content[cursor].isspace():
            cursor += 1
        options_text: str | None = None
        if cursor < len(content) and content[cursor] == ",":
            cursor += 1
            while cursor < len(content) and content[cursor].isspace():
                cursor += 1
            if cursor < len(content) and content[cursor] == "{":
                parsed = _read_balanced_object(content, cursor)
                if parsed is not None:
                    options_text, cursor = parsed
        close_paren = content.find(")", cursor)
        end_index = close_paren + 1 if close_paren >= 0 else cursor
        method = _extract_fetch_method(options_text)
        results.append((method, raw_path, match.start(), end_index))
    return results


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

    for method, raw_path, start, end in _extract_fetch_calls(content):
        _append_signal(
            signals,
            kind="http_call",
            method=method,
            raw_path=raw_path,
            content=content,
            match_start=start,
            match_end=end,
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
