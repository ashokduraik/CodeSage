"""Approximate token counting for context-window packing.

Uses a cached ``tiktoken`` encoding as a model-agnostic estimator. This is not the
exact tokenizer for every backend model (e.g. qwen), but it is consistent and
dependency-light; a completion-token reserve absorbs the small estimation error so
packed prompts do not overflow the model's context window.
"""

from __future__ import annotations

from functools import lru_cache

import tiktoken

_ENCODING_NAME = "o200k_base"


@lru_cache(maxsize=1)
def _encoding() -> tiktoken.Encoding:
    """Return the shared tiktoken encoding, loaded once per process.

    @returns The cached ``o200k_base`` encoding used for all token counts.
    """
    return tiktoken.get_encoding(_ENCODING_NAME)


def count_tokens(text: str) -> int:
    """Estimate the number of tokens in a string.

    @param text - Text to measure (prompt fragment, code excerpt, or question).
    @returns Approximate token count; ``0`` for empty input.
    """
    if not text:
        return 0
    return len(_encoding().encode(text))


def truncate_to_tokens(text: str, max_tokens: int) -> str:
    """Shorten text so it encodes to at most ``max_tokens`` tokens.

    Used when a single code excerpt is larger than the whole context budget so the
    top-ranked chunk can still be sent (truncated) rather than dropped.

    @param text - Text to shorten.
    @param max_tokens - Maximum allowed tokens; values <= 0 yield an empty string.
    @returns The original text when it already fits, otherwise a truncated prefix.
    """
    if max_tokens <= 0:
        return ""
    encoding = _encoding()
    tokens = encoding.encode(text)
    if len(tokens) <= max_tokens:
        return text
    return encoding.decode(tokens[:max_tokens])
