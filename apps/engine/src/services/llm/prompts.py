"""Prompt templates for grounded code QA and the agent planner."""

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

# Planner system prompt for the agent loop (ADR 0026). Tool schemas are sent via the
# OpenAI ``tools`` API parameter — this text only describes how to use them.
AGENT_PLANNER_SYSTEM_PROMPT = (
    "You are the CodeSage retrieval planner. Your job is to gather evidence from the "
    "indexed codebase by calling the provided tools. Tool schemas are supplied by the "
    "API — call them by name with valid JSON arguments. "
    "For any question about code, architecture, behaviour, or files: you MUST call "
    "tools before answering; never invent file paths, symbol names, or code. "
    "Prefer targeted tools (search_symbols, search_code, read_file) when you know "
    "what to look for; use search_hybrid when unsure where to start. "
    "For brief social turns (greetings, thanks), reply in one short sentence without "
    "calling tools. "
    "Do not write a final grounded code answer yourself — only gather evidence via tools "
    "or reply briefly when no retrieval is needed."
)


def build_code_qa_messages(
    question: str,
    context_blocks: list[str],
    history: list[dict[str, str]] | None = None,
) -> list[dict[str, str]]:
    """Build chat messages for a grounded developer code question.

    Prior turns are inserted between the system prompt and the current user message
    so the LLM can answer follow-up questions in context.

    @param question - User question.
    @param context_blocks - Retrieved code excerpts with file paths.
    @param history - Optional prior turns (oldest first) with ``role`` and ``content``.
    @returns OpenAI-style message list for the LLM provider.
    """
    context = "\n\n---\n\n".join(context_blocks)
    user = f"Question:\n{question}\n\nCode excerpts:\n{context}"
    messages: list[dict[str, str]] = [{"role": "system", "content": CODE_QA_SYSTEM_PROMPT}]
    if history:
        messages.extend(history)
    messages.append({"role": "user", "content": user})
    return messages



def build_code_qa_messages(
    question: str,
    context_blocks: list[str],
    history: list[dict[str, str]] | None = None,
) -> list[dict[str, str]]:
    """Build chat messages for a grounded developer code question.

    Prior turns are inserted between the system prompt and the current user message
    so the LLM can answer follow-up questions in context.

    @param question - User question.
    @param context_blocks - Retrieved code excerpts with file paths.
    @param history - Optional prior turns (oldest first) with ``role`` and ``content``.
    @returns OpenAI-style message list for the LLM provider.
    """
    context = "\n\n---\n\n".join(context_blocks)
    user = f"Question:\n{question}\n\nCode excerpts:\n{context}"
    messages: list[dict[str, str]] = [{"role": "system", "content": CODE_QA_SYSTEM_PROMPT}]
    if history:
        messages.extend(history)
    messages.append({"role": "user", "content": user})
    return messages
