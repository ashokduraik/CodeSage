"""Prompt templates for grounded code QA."""

from __future__ import annotations

# System instruction shared by the prompt builder and context-budget accounting.
# Exposed as a constant so the packer can count its tokens without rebuilding messages.
CODE_QA_SYSTEM_PROMPT = (
    "You are a codebase assistant. Answer the user's specific question directly and "
    "completely, using ONLY the provided code excerpts. Trace the exact logic that "
    "answers it — the relevant functions, formulas, and control flow — and lead with "
    "the direct answer. Do NOT give a general overview, summarize unrelated features, "
    "or suggest improvements unless the user explicitly asks. "
    'If the excerpts do not contain enough information, reply exactly: '
    '"I\'m not certain — the retrieved code does not contain enough information to answer that." '
    "Cite the file paths you rely on. Be concise and accurate."
)


def build_code_qa_messages(question: str, context_blocks: list[str]) -> list[dict[str, str]]:
    """Build chat messages for a grounded developer code question.

    @param question - User question.
    @param context_blocks - Retrieved code excerpts with file paths.
    @returns OpenAI-style message list for the LLM provider.
    """
    context = "\n\n---\n\n".join(context_blocks)
    user = f"Question:\n{question}\n\nCode excerpts:\n{context}"
    return [
        {"role": "system", "content": CODE_QA_SYSTEM_PROMPT},
        {"role": "user", "content": user},
    ]
