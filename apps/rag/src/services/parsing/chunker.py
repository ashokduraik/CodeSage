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
    """Split lines into overlapping windows."""
    chunks: list[SourceChunk] = []
    start = 0
    while start < len(lines):
        end = min(start + max_lines, len(lines))
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
    """Chunk one symbol span, sub-splitting when it exceeds max_lines."""
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
    """Split source into AST-aware chunks with line-window fallback.

    @param content - Full file contents.
    @param file_path - Relative path used to select tree-sitter grammar.
    @param min_lines - Target minimum lines per chunk when splitting large files.
    @param max_lines - Hard maximum lines per chunk.
    @returns Non-empty chunk list; empty files yield no chunks.
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

    return _chunk_by_lines(lines, min_lines=min_lines, max_lines=max_lines)
