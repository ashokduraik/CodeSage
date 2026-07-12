"""AST-aware chunking for JS/TS source files (Phase 1)."""

from __future__ import annotations

from dataclasses import dataclass

from services.parsing.tree_sitter_parser import SymbolSpan, extract_symbol_spans


@dataclass(frozen=True)
class SourceChunk:
    """A slice of source code ready for persistence and embedding."""

    content: str
    span: dict[str, int]
    symbol_refs: list[dict[str, str | int]] | None = None


def _chunk_by_lines(
    lines: list[str],
    *,
    min_lines: int,
    max_lines: int,
    symbol_refs: list[dict[str, str | int]] | None = None,
) -> list[SourceChunk]:
    """Split lines into fixed-size windows with a minimum tail size.

    @param lines - Source lines without trailing newlines.
    @param min_lines - Extend the final window to at least this many lines when possible.
    @param max_lines - Maximum lines per chunk window.
    @param symbol_refs - Optional AST symbol metadata attached to every window.
    @returns Non-overlapping line-window chunks covering the full input.
    """
    chunks: list[SourceChunk] = []
    start = 0
    while start < len(lines):
        end = min(start + max_lines, len(lines))
        # Avoid emitting a tiny final chunk (e.g. five lines) when we could merge it with
        # the previous window — small chunks embed poorly and retrieve with low signal.
        if end - start < min_lines and end < len(lines):
            end = min(start + min_lines, len(lines))
        body = "\n".join(lines[start:end])
        chunks.append(
            SourceChunk(
                content=body,
                span={"startLine": start + 1, "endLine": end},
                symbol_refs=symbol_refs,
            ),
        )
        if end >= len(lines):
            break
        start = end
    return chunks


def _chunk_symbol_block(
    lines: list[str],
    symbol: SymbolSpan,
    *,
    min_lines: int,
    max_lines: int,
) -> list[SourceChunk]:
    """Chunk one symbol span, sub-splitting when it exceeds max_lines.

    @param lines - Full file lines.
    @param symbol - AST symbol with 1-based line bounds.
    @param min_lines - Minimum lines per sub-chunk when splitting large symbols.
    @param max_lines - Maximum lines per chunk.
    @returns One or more chunks tagged with the symbol reference.
    """
    start_idx = max(symbol.start_line - 1, 0)
    end_idx = min(symbol.end_line, len(lines))
    block = lines[start_idx:end_idx]
    symbol_ref = {"kind": symbol.kind, "name": symbol.name, "startLine": symbol.start_line}
    if len(block) <= max_lines:
        return [
            SourceChunk(
                content="\n".join(block),
                span={"startLine": symbol.start_line, "endLine": end_idx},
                symbol_refs=[symbol_ref],
            ),
        ]
    return _chunk_by_lines(
        block,
        min_lines=min_lines,
        max_lines=max_lines,
        symbol_refs=[symbol_ref],
    )


def chunk_source(
    content: str,
    *,
    file_path: str = "",
    min_lines: int = 40,
    max_lines: int = 60,
) -> list[SourceChunk]:
    """Split a source file into chunks suitable for embedding and retrieval.

    Prefers AST-aware splits at function/class/method boundaries when tree-sitter can
    parse the file. Falls back to fixed line windows for unsupported extensions, parse
    errors, or files without extractable top-level symbols.

    @param content - Full text of the source file.
    @param file_path - Relative path used to select the tree-sitter grammar.
    @param min_lines - Target minimum lines per chunk when splitting large symbols.
    @param max_lines - Hard maximum lines per chunk (embedding and context window limit).
    @returns A list of chunks; empty files produce an empty list.
    """
    lines = content.splitlines()
    if not lines:
        return []

    symbols = extract_symbol_spans(content, file_path) if file_path else []
    if symbols:
        chunks: list[SourceChunk] = []
        for symbol in symbols:
            chunks.extend(
                _chunk_symbol_block(lines, symbol, min_lines=min_lines, max_lines=max_lines),
            )
        if chunks:
            return chunks

    # No AST symbols (unsupported extension, parse error, or empty file). Fall back to
    # fixed line windows so indexing still works without tree-sitter structure.
    return _chunk_by_lines(lines, min_lines=min_lines, max_lines=max_lines)
