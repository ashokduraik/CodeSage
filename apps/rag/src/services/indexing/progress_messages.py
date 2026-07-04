"""User-facing progress messages aligned with indexing log wording."""

from __future__ import annotations

from config.logging import IndexingContext, format_indexing_context, short_commit

_TRIGGER_SUFFIX: dict[str, str] = {
    "initial_attach": "(first time)",
    "manual_sync": "(manual re-index)",
    "webhook_push": "(new commit pushed)",
}


def repo_label(ctx: IndexingContext | None, fallback: str) -> str:
    """Build a short repo label for progress messages.

    @param ctx - Resolved indexing context.
    @param fallback - Label when context is missing.
    @returns Credential-free repo label.
    """
    if ctx is None:
        return fallback
    return format_indexing_context(ctx)


def started_message(
    step: str,
    ctx: IndexingContext | None,
    *,
    fallback: str,
    trigger: str | None = None,
    file_count: int | None = None,
    section_count: int | None = None,
    sync_is_update: bool | None = None,
) -> str:
    """Build the user-facing message for a step ``started`` event.

    @param step - Pipeline step (sync, parse, embed).
    @param ctx - Resolved indexing context.
    @param fallback - Repo label fallback.
    @param trigger - Optional indexing run trigger (sync step only).
    @param file_count - Files to parse (parse step).
    @param section_count - Sections to embed (embed step).
    @param sync_is_update - True when sync fetches an existing clone; False on first clone.
    @returns Plain-English started message.
    """
    label = repo_label(ctx, fallback)
    suffix = ""
    if step == "sync" and trigger:
        suffix = f" {_TRIGGER_SUFFIX.get(trigger, '')}".rstrip()

    if step == "sync":
        if sync_is_update:
            return f"Fetching latest changes for {label}{suffix}".strip()
        return f"Cloning repository for {label}{suffix}".strip()
    if step == "parse":
        count = file_count if file_count is not None else 0
        return f"Reading {count} source files for {label}"
    if step == "embed":
        count = section_count if section_count is not None else 0
        return f"Making {count} code sections searchable for {label}"
    return f"Indexing step {step} started for {label}"


def finished_sync_message(
    ctx: IndexingContext | None,
    *,
    fallback: str,
    commit_sha: str,
    file_count: int,
    is_update: bool = False,
) -> str:
    """Build a sync ``finished`` message when files changed.

    @param ctx - Resolved indexing context.
    @param fallback - Repo label fallback.
    @param commit_sha - Git HEAD SHA.
    @param file_count - Number of changed files.
    @param is_update - True when sync fetched an existing clone.
    @returns Plain-English finished message.
    """
    label = repo_label(ctx, fallback)
    verb = "updated" if is_update else "download complete"
    return (
        f"Repository {verb} for {label} "
        f"(commit {short_commit(commit_sha)}) — {file_count} files changed"
    )


def skipped_up_to_date_message(ctx: IndexingContext | None, *, fallback: str) -> str:
    """Build a sync ``skipped`` message when the repo is already up to date.

    @param ctx - Resolved indexing context.
    @param fallback - Repo label fallback.
    @returns Plain-English skipped message.
    """
    label = repo_label(ctx, fallback)
    return f"Repository is up to date for {label} — no files to read"


def finished_parse_message(
    ctx: IndexingContext | None,
    *,
    fallback: str,
    files_read: int,
    sections_created: int,
) -> str:
    """Build a parse ``finished`` message.

    @param ctx - Resolved indexing context.
    @param fallback - Repo label fallback.
    @param files_read - Files successfully parsed.
    @param sections_created - Code sections created.
    @returns Plain-English finished message.
    """
    label = repo_label(ctx, fallback)
    return (
        f"Read {files_read} files, created {sections_created} code sections for {label}"
    )


def skipped_no_sections_message(ctx: IndexingContext | None, *, fallback: str) -> str:
    """Build a parse ``skipped`` message when no code sections were created.

    @param ctx - Resolved indexing context.
    @param fallback - Repo label fallback.
    @returns Plain-English skipped message.
    """
    label = repo_label(ctx, fallback)
    return f"No code sections created for {label} — skipping embedding"


def finished_embed_message(
    ctx: IndexingContext | None,
    *,
    fallback: str,
    sections_embedded: int,
    elapsed_s: int,
) -> str:
    """Build an embed ``finished`` message.

    @param ctx - Resolved indexing context.
    @param fallback - Repo label fallback.
    @param sections_embedded - Sections embedded in this batch.
    @param elapsed_s - Wall-clock seconds for the batch.
    @returns Plain-English finished message.
    """
    label = repo_label(ctx, fallback)
    return (
        f"Indexed {sections_embedded} code sections for {label} (took {elapsed_s}s)"
    )


def skipped_no_chunks_message(ctx: IndexingContext | None, *, fallback: str) -> str:
    """Build an embed ``skipped`` message when no valid chunks exist.

    @param ctx - Resolved indexing context.
    @param fallback - Repo label fallback.
    @returns Plain-English skipped message.
    """
    label = repo_label(ctx, fallback)
    return f"No valid code sections to index for {label}"
