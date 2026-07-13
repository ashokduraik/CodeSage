import type { Sql } from "../../platform/db";
import { ApiError } from "../../platform/errors";
import { encryptToken, decryptToken, parseEncryptionKey } from "../../platform/encryption";
import {
  cancelPendingJobsForRepo,
  enqueueJob,
  findActiveJobsForRepo,
  hasActiveJobsWithinStaleWindow,
} from "../../platform/queue";
import { findProjectById } from "../projects/projects.repository";
import { probeRepo } from "./repo-probe.service";
import { parseRepoUrl } from "./repo-url";
import { registerRepoWebhook, unregisterRepoWebhook } from "./repo-webhook.service";
import {
  findReposByProject,
  findRepoById,
  findRepoSecretsById,
  insertRepo,
  updateRepoWebhook,
  softDeleteRepo,
  setRepoConnecting,
  findIndexingEventsByRepo,
  type RepoRow,
  type RepoListRow,
  type RepoIndexingEventRow,
} from "./repos.repository";
import {
  decodeIndexingEventsCursor,
  encodeIndexingEventsCursor,
} from "./indexing-events-cursor";
import type { NodeApi } from "@codesage/shared-types";

type CreateRepoRequest = NodeApi.components["schemas"]["CreateRepoRequest"];
type RepoIndexingEvent = NodeApi.components["schemas"]["RepoIndexingEvent"];
type RepoIndexingEventListResponse =
  NodeApi.components["schemas"]["RepoIndexingEventListResponse"];

const INDEXING_EVENTS_MAX_LIMIT = 50;
const INDEXING_EVENTS_DEFAULT_LIMIT = 50;

/** Converts a repository row to the public API response shape. */
function toRepoResponse(
  row: RepoRow,
  indexedFileCount = 0,
): NodeApi.components["schemas"]["Repo"] {
  return {
    id: row.id,
    projectId: row.project_id,
    repoUrl: row.repo_url,
    provider: row.provider as NodeApi.components["schemas"]["RepoProvider"],
    branch: row.branch,
    fullName: row.full_name ?? "",
    description: row.description ?? undefined,
    baseUrl: row.base_url ?? undefined,
    isPrivate: row.is_private,
    connectionStatus:
      row.connection_status as NodeApi.components["schemas"]["RepoConnectionStatus"],
    lastError: row.last_error ?? undefined,
    lastErrorAt: row.last_error_at?.toISOString(),
    webhookEnabled: row.webhook_enabled,
    lastIndexedSha: row.last_indexed_sha ?? undefined,
    lastIndexedAt: row.last_indexed_at?.toISOString(),
    primaryLanguage: row.primary_language ?? undefined,
    indexedFileCount,
    createdAt: row.created_at.toISOString(),
  };
}

/** Converts a repo_indexing_events row to the public API response shape. */
function toIndexingEventResponse(row: RepoIndexingEventRow): RepoIndexingEvent {
  const detailsElapsed =
    row.details && typeof row.details.elapsed_ms === "number"
      ? row.details.elapsed_ms
      : undefined;
  const durationMs = row.duration_ms ?? detailsElapsed ?? undefined;

  return {
    id: row.id,
    runId: row.run_id,
    step: row.step as RepoIndexingEvent["step"],
    phase: row.phase as RepoIndexingEvent["phase"],
    startedAt: row.started_at.toISOString(),
    durationMs: durationMs ?? undefined,
    message: row.message,
    failureReason: row.failure_reason ?? undefined,
    trigger: row.trigger
      ? (row.trigger as NonNullable<RepoIndexingEvent["trigger"]>)
      : undefined,
    details: row.details ?? undefined,
  };
}

/**
 * Lists all active repos attached to a project.
 *
 * @param db - The postgres.js SQL client.
 * @param projectId - Parent project UUID.
 * @returns Array of public repo responses (may be empty).
 * @throws {@link ApiError} 404 when the parent project does not exist.
 */
export async function listRepos(
  db: Sql,
  projectId: string,
): Promise<NodeApi.components["schemas"]["Repo"][]> {
  const project = await findProjectById(db, projectId);
  if (!project) {
    throw new ApiError(404, "NOT_FOUND", "Project not found.");
  }
  const rows = await findReposByProject(db, projectId);
  return rows.map((row: RepoListRow) =>
    toRepoResponse(row, row.indexed_file_count),
  );
}

/**
 * Probes a repository URL before attach (branches, README, auth check).
 *
 * @param repoUrl - HTTPS clone URL.
 * @param token - Optional access token (never stored).
 * @returns Probe response for the connect wizard.
 */
export async function probeRepoUrl(
  repoUrl: string,
  token?: string,
): Promise<NodeApi.components["schemas"]["ProbeRepoResponse"]> {
  return probeRepo(repoUrl, token);
}

/**
 * Attaches a new repository to a project, registers a webhook when possible,
 * and enqueues the initial sync job.
 *
 * @param db - The postgres.js SQL client.
 * @param projectId - Parent project UUID.
 * @param body - Attach request from the connect wizard.
 * @param encryptionKey - Base64-encoded 32-byte AES key from config.
 * @param webhookBaseUrl - Public URL for webhook callbacks (optional).
 * @returns The attached repo and the enqueued sync job ID.
 */
export async function attachRepo(
  db: Sql,
  projectId: string,
  body: CreateRepoRequest,
  encryptionKey: string,
  webhookBaseUrl: string,
  actorId: string,
): Promise<{ repo: NodeApi.components["schemas"]["Repo"]; jobId: string }> {
  const project = await findProjectById(db, projectId);
  if (!project) {
    throw new ApiError(404, "NOT_FOUND", "Project not found.");
  }

  const parsed = parseRepoUrl(body.repoUrl);
  if (!parsed) {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "Enter a valid HTTPS repository URL, e.g. https://github.com/org/repo",
    );
  }

  const branch = body.branch?.trim() || "main";
  const baseUrl = body.baseUrl?.trim() || parsed.baseUrl;

  let tokenEnc: string | null = null;
  if (body.token) {
    if (!encryptionKey) {
      throw new ApiError(
        400,
        "ENCRYPTION_NOT_CONFIGURED",
        "TOKEN_ENC_KEY must be set to store private repo tokens.",
      );
    }
    const key = parseEncryptionKey(encryptionKey);
    tokenEnc = encryptToken(body.token, key);
  }

  const isPrivate = Boolean(body.token);
  const primaryLanguage = body.primaryLanguage?.trim() || null;

  const row = await insertRepo(db, {
    projectId,
    repoUrl: parsed.normalizedUrl,
    provider: parsed.provider,
    branch,
    fullName: parsed.fullName,
    description: body.description?.trim() || null,
    baseUrl: parsed.isSelfHosted ? baseUrl : null,
    isPrivate,
    tokenEnc,
    primaryLanguage,
  }, actorId);

  const webhook = await registerRepoWebhook(
    { ...parsed, baseUrl: baseUrl || parsed.baseUrl },
    body.token,
    parsed.provider,
    webhookBaseUrl,
    encryptionKey,
  );
  if (webhook.webhookEnabled && webhook.webhookId && webhook.webhookSecretEnc) {
    await updateRepoWebhook(db, row.id, webhook.webhookId, webhook.webhookSecretEnc, actorId);
    row.webhook_id = webhook.webhookId;
    row.webhook_enabled = true;
  }

  await cancelPendingJobsForRepo(db, row.id, actorId);
  const jobId = await enqueueJob(db, "sync", { repoId: row.id, trigger: "initial_attach" }, actorId);
  return { repo: toRepoResponse(row), jobId };
}

/**
 * Enqueues a manual sync job for an active repository.
 *
 * @param db - The postgres.js SQL client.
 * @param projectId - Parent project UUID.
 * @param repoId - Repo UUID.
 * @param actorId - Acting user UUID.
 * @param workerStaleJobSeconds - Minimum job age before re-index is allowed (default 600).
 * @returns The enqueued sync job ID.
 * @throws {@link ApiError} 404 when the repo does not exist in the project.
 * @throws {@link ApiError} 409 when indexing is already in progress.
 */
export async function syncRepo(
  db: Sql,
  projectId: string,
  repoId: string,
  actorId: string,
  workerStaleJobSeconds = 600,
): Promise<{ jobId: string }> {
  const row = await findRepoById(db, projectId, repoId);
  if (!row) {
    throw new ApiError(404, "NOT_FOUND", "Repo not found in this project.");
  }

  const activeJobs = await findActiveJobsForRepo(db, repoId);
  if (hasActiveJobsWithinStaleWindow(activeJobs, workerStaleJobSeconds)) {
    throw new ApiError(
      409,
      "CONFLICT",
      "Indexing already in progress; retry after 10 minutes.",
    );
  }

  await cancelPendingJobsForRepo(db, repoId, actorId);
  await setRepoConnecting(db, repoId, actorId);
  const jobId = await enqueueJob(db, "sync", { repoId, trigger: "manual_sync" }, actorId);
  return { jobId };
}

/**
 * Lists indexing progress events for a repository (newest first, cursor pagination).
 *
 * @param db - The postgres.js SQL client.
 * @param projectId - Parent project UUID.
 * @param repoId - Repo UUID.
 * @param params - Optional limit and cursor for older pages.
 * @returns Paginated event list with nextCursor when more rows exist.
 * @throws {@link ApiError} 404 when the repo does not exist in the project.
 * @throws {@link ApiError} 400 when the cursor is invalid.
 */
export async function listRepoIndexingEvents(
  db: Sql,
  projectId: string,
  repoId: string,
  params: { limit?: number; cursor?: string } = {},
): Promise<RepoIndexingEventListResponse> {
  const repo = await findRepoById(db, projectId, repoId);
  if (!repo) {
    throw new ApiError(404, "NOT_FOUND", "Repo not found in this project.");
  }

  const requestedLimit = params.limit ?? INDEXING_EVENTS_DEFAULT_LIMIT;
  const limit = Math.min(
    Math.max(1, Math.floor(requestedLimit)),
    INDEXING_EVENTS_MAX_LIMIT,
  );
  const fetchLimit = limit + 1;

  let cursorStartedAt: Date | undefined;
  let cursorId: string | undefined;
  if (params.cursor) {
    const decoded = decodeIndexingEventsCursor(params.cursor);
    cursorStartedAt = new Date(decoded.startedAt);
    cursorId = decoded.id;
    if (Number.isNaN(cursorStartedAt.getTime())) {
      throw new ApiError(400, "VALIDATION_ERROR", "Invalid cursor.");
    }
  }

  const rows = await findIndexingEventsByRepo(db, projectId, repoId, {
    limit: fetchLimit,
    cursorStartedAt,
    cursorId,
  });

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const lastRow = pageRows[pageRows.length - 1];

  return {
    items: pageRows.map(toIndexingEventResponse),
    limit,
    hasMore,
    nextCursor:
      hasMore && lastRow
        ? encodeIndexingEventsCursor({
            startedAt: lastRow.started_at.toISOString(),
            id: lastRow.id,
          })
        : null,
  };
}

/**
 * Soft-detaches a repository from a project and best-effort deletes its provider webhook.
 *
 * @param db - The postgres.js SQL client.
 * @param projectId - Parent project UUID.
 * @param repoId - Repo UUID.
 * @param encryptionKey - Base64 AES key for decrypting stored token.
 * @throws {@link ApiError} 404 when the repo does not exist in the project.
 */
export async function detachRepo(
  db: Sql,
  projectId: string,
  repoId: string,
  encryptionKey: string,
  actorId: string,
  cleanupReason: "repo_detach" | "project_delete" = "repo_detach",
): Promise<void> {
  const row = await findRepoSecretsById(db, projectId, repoId);
  if (!row) {
    throw new ApiError(404, "NOT_FOUND", "Repo not found in this project.");
  }

  const parsed = parseRepoUrl(row.repo_url);
  if (parsed && row.webhook_id) {
    let token: string | undefined;
    if (row.token_enc && encryptionKey) {
      try {
        const key = parseEncryptionKey(encryptionKey);
        const ciphertext = row.token_enc.toString("utf8");
        token = decryptToken(ciphertext, key);
      } catch {
        token = undefined;
      }
    }
    await unregisterRepoWebhook(
      parsed,
      row.provider as NodeApi.components["schemas"]["RepoProvider"],
      token,
      row.webhook_id,
    );
  }

  await cancelPendingJobsForRepo(db, repoId, actorId);

  const deleted = await softDeleteRepo(db, projectId, repoId, actorId);
  if (!deleted) {
    throw new ApiError(404, "NOT_FOUND", "Repo not found in this project.");
  }

  await enqueueJob(
    db,
    "repo_cleanup",
    { repoId, reason: cleanupReason },
    actorId,
  );
}
