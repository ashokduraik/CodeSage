"""Prompt templates for grounded code QA."""

from __future__ import annotations


def build_code_qa_messages(question: str, context_blocks: list[str]) -> list[dict[str, str]]:
    """Build chat messages for a grounded developer code question.

    @param question - User question.
    @param context_blocks - Retrieved code excerpts with file paths.
    @returns OpenAI-style message list for the LLM provider.
    """
    context = "\n\n---\n\n".join(context_blocks)
    system = (
        "You are a codebase assistant. Answer ONLY using the provided code excerpts. "
        "If the excerpts do not contain enough information, say you are not certain. "
        "Reference file paths when relevant. Be concise and accurate."
    )
    user = f"Question:\n{question}\n\nCode excerpts:\n{context}"
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]
