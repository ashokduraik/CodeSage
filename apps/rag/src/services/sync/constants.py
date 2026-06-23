"""Indexable source file extensions and directory skip rules."""

from __future__ import annotations

INDEXABLE_EXTENSIONS: frozenset[str] = frozenset(
    {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"},
)

SKIP_DIR_NAMES: frozenset[str] = frozenset(
    {
        ".git",
        "node_modules",
        "dist",
        "build",
        "coverage",
        "__pycache__",
        ".next",
        "vendor",
    },
)
