import { describe, it, expect, vi, afterEach } from "vitest";
import { handlePushWebhook, extractPushMetadata } from "./webhooks.service";
import { WEBHOOK_HANDLER_USER_ID } from "../../platform/serviceUsers";
import type { Sql } from "../../platform/db";

vi.mock("../repos/repos.repository", () => ({
  findRepoByUrl: vi.fn(),
}));

vi.mock("../../platform/queue", () => ({
  enqueueJob: vi.fn(),
  cancelPendingJobsForRepo: vi.fn(),
}));

import { findRepoByUrl } from "../repos/repos.repository";
import { cancelPendingJobsForRepo, enqueueJob } from "../../platform/queue";
import { encryptToken, parseEncryptionKey } from "../../platform/encryption";

const mockFindRepo = vi.mocked(findRepoByUrl);
const mockEnqueue = vi.mocked(enqueueJob);
const mockCancelPending = vi.mocked(cancelPendingJobsForRepo);
const DB = {} as Sql;
const KEY = Buffer.alloc(32, 2).toString("base64");

afterEach(() => vi.clearAllMocks());

describe("extractPushMetadata", () => {
  it("extracts GitHub clone URL and ref", () => {
    const meta = extractPushMetadata("github", {
      ref: "refs/heads/main",
      before: "abc",
      repository: { clone_url: "https://github.com/org/repo.git" },
    });
    expect(meta.ref).toBe("refs/heads/main");
    expect(meta.cloneUrl).toContain("github.com");
  });
});

describe("handlePushWebhook", () => {
  it("enqueues sync when signature is valid and branch matches", async () => {
    const secret = "hook-secret";
    const key = parseEncryptionKey(KEY);
    const secretEnc = encryptToken(secret, key);
    mockFindRepo.mockResolvedValue({
      id: "r1",
      project_id: "p1",
      repo_url: "https://github.com/org/repo",
      provider: "github",
      branch: "main",
      full_name: "org/repo",
      description: null,
      base_url: null,
      is_private: true,
      connection_status: "connected",
      last_error: null,
      last_error_at: null,
      webhook_id: "1",
      webhook_enabled: true,
      last_indexed_sha: null,
      last_indexed_at: null,
      primary_language: null,
      status: "A",
      created_at: new Date(),
      token_enc: null,
      webhook_secret_enc: Buffer.from(secretEnc, "utf8"),
    });

    const rawBody = Buffer.from(JSON.stringify({
      ref: "refs/heads/main",
      before: "sha-old",
      repository: { clone_url: "https://github.com/org/repo.git" },
    }));
    const { createHmac } = await import("node:crypto");
    const sig = createHmac("sha256", secret).update(rawBody).digest("hex");

    await handlePushWebhook(
      DB,
      "github",
      rawBody,
      JSON.parse(rawBody.toString()),
      { "x-hub-signature-256": `sha256=${sig}` },
      KEY,
    );

    expect(mockCancelPending).toHaveBeenCalledWith(DB, "r1", WEBHOOK_HANDLER_USER_ID);
    expect(mockEnqueue).toHaveBeenCalledWith(DB, "sync", {
      repoId: "r1",
      trigger: "webhook_push",
      sinceSha: "sha-old",
    }, WEBHOOK_HANDLER_USER_ID);
  });

  it("throws 404 when repo is not registered", async () => {
    mockFindRepo.mockResolvedValue(undefined);
    await expect(
      handlePushWebhook(DB, "github", Buffer.from("{}"), {}, {}, KEY),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("skips enqueue when push ref does not match configured branch", async () => {
    const secret = "hook-secret";
    const key = parseEncryptionKey(KEY);
    const secretEnc = encryptToken(secret, key);
    mockFindRepo.mockResolvedValue({
      id: "r1",
      project_id: "p1",
      repo_url: "https://github.com/org/repo",
      provider: "github",
      branch: "main",
      full_name: "org/repo",
      description: null,
      base_url: null,
      is_private: false,
      connection_status: "connected",
      last_error: null,
      last_error_at: null,
      webhook_id: "1",
      webhook_enabled: true,
      last_indexed_sha: null,
      last_indexed_at: null,
      primary_language: null,
      status: "A",
      created_at: new Date(),
      token_enc: null,
      webhook_secret_enc: Buffer.from(secretEnc, "utf8"),
    });

    const rawBody = Buffer.from(JSON.stringify({
      ref: "refs/heads/develop",
      repository: { clone_url: "https://github.com/org/repo.git" },
    }));
    const { createHmac } = await import("node:crypto");
    const sig = createHmac("sha256", secret).update(rawBody).digest("hex");

    await handlePushWebhook(
      DB,
      "github",
      rawBody,
      JSON.parse(rawBody.toString()),
      { "x-hub-signature-256": `sha256=${sig}` },
      KEY,
    );

    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});
