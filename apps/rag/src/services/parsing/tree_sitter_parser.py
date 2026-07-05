"""tree-sitter parsing helpers for JS/TS source files (ADR 0007)."""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from tree_sitter import Language, Node, Parser, Query, QueryCursor

SYMBOL_NODE_TYPES: frozenset[str] = frozenset(
    {
        "function_declaration",
        "class_declaration",
        "method_definition",
        "arrow_function",
        "export_statement",
    },
)


@dataclass(frozen=True)
class SymbolSpan:
    """A named AST symbol with 1-based line bounds."""

    kind: str
    name: str
    start_line: int
    end_line: int


def _language_for_suffix(suffix: str) -> Language | None:
    """Resolve a tree-sitter Language for a file extension.

    @param suffix - Lowercase extension including the dot.
    @returns Language instance or None when unsupported.
    """
    if suffix in {".js", ".jsx", ".mjs", ".cjs"}:
        import tree_sitter_javascript as ts_js

        return Language(ts_js.language())
    if suffix in {".ts", ".tsx"}:
        import tree_sitter_typescript as ts_ts

        return Language(ts_ts.language_typescript() if suffix == ".ts" else ts_ts.language_tsx())
    return None


@lru_cache(maxsize=4)
def _parser_for_suffix(suffix: str) -> Parser | None:
    """Return a cached Parser for the given extension.

    @param suffix - Lowercase extension including the dot.
    @returns Configured parser or ``None`` when the extension is unsupported.
    """
    language = _language_for_suffix(suffix)
    if language is None:
        return None
    parser = Parser(language)
    return parser


def _node_name(node: Node, source: bytes) -> str:
    """Best-effort symbol name from an AST node.

    @param node - tree-sitter node (function, class, or method).
    @param source - Original file bytes for slice extraction.
    @returns Declared identifier or the node type when unnamed.
    """
    name_node = node.child_by_field_name("name")
    if name_node is not None:
        return source[name_node.start_byte : name_node.end_byte].decode("utf-8", errors="replace")
    for child in node.children:
        if child.type in {"identifier", "property_identifier", "type_identifier"}:
            return source[child.start_byte : child.end_byte].decode("utf-8", errors="replace")
    return node.type


def extract_symbol_spans(content: str, file_path: str) -> list[SymbolSpan]:
    """Extract top-level symbol line spans from JS/TS source via tree-sitter.

    @param content - Full file text.
    @param file_path - Relative path (used to pick grammar).
    @returns Symbol spans; empty when parsing is unavailable or fails.
    """
    suffix = Path(file_path).suffix.lower()
    parser = _parser_for_suffix(suffix)
    if parser is None or not content.strip():
        return []

    source = content.encode("utf-8")
    tree = parser.parse(source)
    # When the file has syntax errors, symbol boundaries are unreliable. Return empty so
    # ``chunk_source`` falls back to line-window splitting instead of bad AST chunks.
    if tree.root_node.has_error:
        return []

    language = _language_for_suffix(suffix)
    if language is None:
        return []

    query_text = """
    (function_declaration) @fn
    (class_declaration) @cls
    (method_definition) @method
    """
    query = Query(language, query_text)
    cursor = QueryCursor(query)
    spans: list[SymbolSpan] = []

    # The tree-sitter query intentionally matches top-level declarations only. Nested inner
    # functions and anonymous callbacks are covered by the line-window fallback in chunker.
    for _pattern_index, captures in cursor.matches(tree.root_node):
        for capture_name, nodes in captures.items():
            if capture_name not in {"fn", "cls", "method"}:
                continue
            kind = {
                "fn": "function",
                "cls": "class",
                "method": "method",
            }[capture_name]
            for node in nodes:
                spans.append(
                    SymbolSpan(
                        kind=kind,
                        name=_node_name(node, source),
                        start_line=node.start_point[0] + 1,
                        end_line=node.end_point[0] + 1,
                    ),
                )

    spans.sort(key=lambda span: span.start_line)
    return spans
