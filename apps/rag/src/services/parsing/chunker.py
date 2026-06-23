"""AST-aware-ish chunking for JS/TS source files (Phase 1 line windows)."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class SourceChunk:
    """A slice of source code ready for persistence and embedding."""

    content: str
    span: dict[str, int]


def chunk_source(content: str, *, min_lines: int = 40, max_lines: int = 60) -> list[SourceChunk]:
    """Split source into overlapping line windows suitable for RAG retrieval.

    Uses fixed line windows (tree-sitter symbol boundaries land in a later iteration).

    @param content - Full file contents.
    @param min_lines - Target minimum lines per chunk when splitting large files.
    @param max_lines - Hard maximum lines per chunk.
    @returns Non-empty chunk list; empty files yield no chunks.
    """
    lines = content.splitlines()
    if not lines:
        return []

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
            ),
        )
        if end >= len(lines):
            break
        start = end
    return chunks
