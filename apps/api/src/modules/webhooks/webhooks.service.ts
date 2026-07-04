import { createHmac, timingSafeEqual } from "node:crypto";
import type { Sql } from "../../platform/db";
import { ApiError } from "../../platform/errors";
import { decryptToken, parseEncryptionKey } from "../../platform/encryption";
import { cancelPendingJobsForRepo, enqueueJob } from "../../platform/queue";
import { resolveServiceUser } from "../../platform/serviceUsers";
import { findRepoByUrl } from "../repos/repos.repository";
import { parseRepoUrl } from "../repos/repo-url";
import type { NodeApi } from "@codesage/shared-types";

type RepoProvider = NodeApi.components["schemas"]["RepoProvider"];

/** GitHub push webhook payload (subset used for routing). */
interface GitHubPushPayload {
  ref?: string;
  before?: string;
  repository?: { clone_url?: string; html_url?: string };
}

/** GitLab push webhook payload (subset used for routing). */
interface GitLabPushPayload {
  ref?: string;
  before?: string;
  project?: { path_with_namespace?: string; web_url?: string };
  repository?: { git_http_url?: string; homepage?: string };
}

/**
 * Normalizes clone URLs for lookup (strip .git suffix, trailing slash).
 *
 * @param url - Raw clone URL from a webhook payload.
 * @returns Normalized HTTPS URL or null.
 */
export function normalizeCloneUrl(url: string): string | null {
  const parsed = parseRepoUrl(url);
  return parsed?.normalizedUrl ?? null;
}

/**
 * Verifies a GitHub `X-Hub-Signature-256` HMAC header.
 *
 * @param rawBody - Raw request body bytes.
 * @param signatureHeader - Header value e.g. `sha256=abc...`.
 * @param secret - Webhook secret plaintext.
 * @returns True when signature matches.
 */
export function verifyGitHubSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  secret: string,
): boolean {
  if (!signatureHeader?.startsWith("sha256=")) {
    return false;
  }
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const received = signatureHeader.slice("sha256=".length);
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received, "hex"));
  } catch {
    return false;
  }
}

/**
 * Verifies a GitLab `X-Gitlab-Token` header against the stored secret.
 *
 * @param tokenHeader - Header value from GitLab.
 * @param secret - Stored webhook secret plaintext.
 * @returns True when token matches.
 */
export function verifyGitLabToken(
  tokenHeader: string | undefined,
  secret: string,
): boolean {
  if (!tokenHeader) {
    return false;
  }
  try {
    return timingSafeEqual(Buffer.from(tokenHeader), Buffer.from(secret));
  } catch {
    return false;
  }
}

/**
 * Extracts clone URL and ref from a provider push payload.
 *
 * @param provider - Git host provider.
 * @param payload - Parsed webhook JSON body.
 * @returns Clone URL and git ref, when present.
 */
export function extractPushMetadata(
  provider: RepoProvider,
  payload: unknown,
): { cloneUrl: string | null; ref: string | null; beforeSha: string | null } {
  if (provider === "github") {
    const body = payload as GitHubPushPayload;
    return {
      cloneUrl: body.repository?.clone_url ?? null,
      ref: body.ref ?? null,
      beforeSha: body.before ?? null,
    };
  }
  const body = payload as GitLabPushPayload;
  const cloneUrl =
    body.repository?.git_http_url ??
    (body.project?.web_url ? `${body.project.web_url.replace(/\/$/, "")}.git` : null);
  return {
    cloneUrl,
    ref: body.ref ?? null,
    beforeSha: body.before ?? null,
  };
}

/**
 * Handles an inbound push webhook: verify signature, match repo, enqueue sync.
 *
 * @param db - Postgres client.
 * @param provider - Git host provider from the URL path.
 * @param rawBody - Raw request body for HMAC verification.
 * @param payload - Parsed JSON body.
 * @param headers - Request headers (signature / token).
 * @param encryptionKey - AES key for decrypting webhook secret.
 * @throws {@link ApiError} 401 on bad signature, 404 when repo unknown.
 */
export async function handlePushWebhook(
  db: Sql,
  provider: RepoProvider,
  rawBody: Buffer,
  payload: unknown,
  headers: Record<string, string | string[] | undefined>,
  encryptionKey: string,
): Promise<void> {
  const { cloneUrl, ref, beforeSha } = extractPushMetadata(provider, payload);
  if (!cloneUrl) {
    throw new ApiError(404, "NOT_FOUND", "Repository not registered.");
  }

  const normalized = normalizeCloneUrl(cloneUrl);
  if (!normalized) {
    throw new ApiError(404, "NOT_FOUND", "Repository not registered.");
  }

  const repo = await findRepoByUrl(db, normalized);
  if (!repo || !repo.webhook_secret_enc) {
    throw new ApiError(404, "NOT_FOUND", "Repository not registered.");
  }

  if (!encryptionKey) {
    throw new ApiError(401, "UNAUTHORIZED", "Webhook verification unavailable.");
  }

  const key = parseEncryptionKey(encryptionKey);
  const secret = decryptToken(repo.webhook_secret_enc.toString("utf8"), key);

  const verified =
    provider === "github"
      ? verifyGitHubSignature(rawBody, headers["x-hub-signature-256"] as string | undefined, secret)
      : verifyGitLabToken(headers["x-gitlab-token"] as string | undefined, secret);

  if (!verified) {
    throw new ApiError(401, "UNAUTHORIZED", "Invalid webhook signature.");
  }

  const expectedRef = `refs/heads/${repo.branch}`;
  if (ref !== expectedRef) {
    return;
  }

  await cancelPendingJobsForRepo(db, repo.id, resolveServiceUser("webhook"));
  await enqueueJob(db, "sync", {
    repoId: repo.id,
    trigger: "webhook_push",
    ...(beforeSha ? { sinceSha: beforeSha } : {}),
  }, resolveServiceUser("webhook"));
}
