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
    "API — call them by name with valid JSON arguments only (no placeholders). "
    "For any question about code, architecture, behaviour, or files: you MUST call "
    "tools before answering; never invent file paths, symbol names, or code. "
    "Conversation history is not evidence — every turn that needs code facts must call tools again. "
    "The current user message may already be a rewritten standalone follow-up that names "
    "files or symbols from prior turns; still call tools (or rely on tool results already "
    "in this conversation) before concluding. "
    "When the user names a file path, call read_chunks_for_path with that path. "
    "For formula or calculation questions: prefer search_symbols or search_hybrid, "
    "then read_chunk(chunk_id) or read_chunks_for_path with around_line / chunk_id from "
    "that hit's span; do not call read_chunks_for_path with only path on a large file "
    "when a span is already known. "
    "Do not stop on UI-only hits (pages, popovers, templates) when logic lives elsewhere. "
    "If prior tool results exist but you have not finished investigating, call another tool; "
    "do not stop with empty tool_calls while formula or implementation questions remain unanswered. "
    "Prefer targeted tools (search_symbols, search_code, read_symbol, read_chunk, "
    "read_chunks_for_path) when you know what to look for; use search_hybrid when unsure. "
    "For brief social turns (greetings, thanks), reply in one short sentence without "
    "calling tools. "
    "Do not write a final grounded code answer yourself — only gather evidence via tools "
    "or reply briefly when no retrieval is needed."
)

# Follow-up rewrite (ADR 0028): turn vague references into a self-contained question.
FOLLOWUP_REWRITE_SYSTEM_PROMPT = (
    "You rewrite follow-up chat questions into a single standalone question for code search. "
    "Use the conversation history only to resolve pronouns and references like "
    "\"the second point\", \"that\", \"from above\", or \"explain more\". "
    "Output ONLY the rewritten question text — no quotes, labels, or explanation. "
    "If the question is already self-contained, echo it unchanged. "
    "Never invent file paths, symbols, or formulas that do not appear in the history. "
    "Prefer concrete file paths and symbols when they appear in prior turns."
)


def build_followup_rewrite_messages(
    question: str,
    history: list[dict[str, str]],
) -> list[dict[str, str]]:
    """Build chat messages for rewriting a follow-up into a standalone question.

    @param question - Current user question (may be vague).
    @param history - Prior turns oldest-first with ``role`` and ``content``.
    @returns OpenAI-style message list for a non-tool completion.
    """
    messages: list[dict[str, str]] = [
        {"role": "system", "content": FOLLOWUP_REWRITE_SYSTEM_PROMPT},
    ]
    capped = history[-10:]
    for turn in capped:
        role = turn.get("role", "")
        content = (turn.get("content") or "").strip()
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": question})
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
