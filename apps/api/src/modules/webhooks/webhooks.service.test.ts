import { createHmac } from "node:crypto";
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  handlePushWebhook,
  extractPushMetadata,
  verifyGitHubSignature,
  verifyGitLabToken,
} from "./webhooks.service";
import { WEBHOOK_HANDLER_USER_ID } from "../../platform/serviceUsers";
import type { Sql } from "../../platform/db";

vi.mock("../repos/repos.repository", () => ({
  findRepoByUrl: vi.fn(),
  setRepoConnecting: vi.fn(),
}));

vi.mock("../../platform/queue", () => ({
  enqueueJob: vi.fn(),
  cancelPendingJobsForRepo: vi.fn(),
}));

import { findRepoByUrl, setRepoConnecting } from "../repos/repos.repository";
import { cancelPendingJobsForRepo, enqueueJob } from "../../platform/queue";
import { encryptToken, parseEncryptionKey } from "../../platform/encryption";

const mockFindRepo = vi.mocked(findRepoByUrl);
const mockSetConnecting = vi.mocked(setRepoConnecting);
const mockEnqueue = vi.mocked(enqueueJob);
const mockCancelPending = vi.mocked(cancelPendingJobsForRepo);
const DB = {} as Sql;
const KEY = Buffer.alloc(32, 2).toString("base64");

/**
 * Builds a repo row for webhook tests, encrypting the given secret.
 *
 * @param secret - Plaintext webhook secret; null omits the stored ciphertext.
 * @param overrides - Partial fields to override on the row.
 * @returns A repo row compatible with {@link findRepoByUrl}.
 */
function makeRepo(
  secret: string | null,
  overrides: Partial<Awaited<ReturnType<typeof findRepoByUrl>>> = {},
): Awaited<ReturnType<typeof findRepoByUrl>> {
  const secretEnc =
    secret === null ? null : Buffer.from(encryptToken(secret, parseEncryptionKey(KEY)), "utf8");
  return {
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
    webhook_secret_enc: secretEnc,
    ...overrides,
  };
}

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

  it("extracts GitLab clone URL from git_http_url", () => {
    const meta = extractPushMetadata("gitlab", {
      ref: "refs/heads/main",
      repository: { git_http_url: "https://gitlab.com/org/repo.git" },
    });
    expect(meta.cloneUrl).toBe("https://gitlab.com/org/repo.git");
  });

  it("falls back to GitLab project web_url when git_http_url is absent", () => {
    const meta = extractPushMetadata("gitlab", {
      project: { web_url: "https://gitlab.com/org/repo/" },
    });
    expect(meta.cloneUrl).toBe("https://gitlab.com/org/repo.git");
    expect(meta.ref).toBeNull();
  });

  it("returns null GitLab clone URL when no source is present", () => {
    const meta = extractPushMetadata("gitlab", {});
    expect(meta.cloneUrl).toBeNull();
  });
});

describe("verifyGitHubSignature", () => {
  const body = Buffer.from("payload");
  const secret = "s3cret";

  it("returns true for a matching signature", () => {
    const sig = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
    expect(verifyGitHubSignature(body, sig, secret)).toBe(true);
  });

  it("returns false when the header is missing", () => {
    expect(verifyGitHubSignature(body, undefined, secret)).toBe(false);
  });

  it("returns false when the header lacks the sha256 prefix", () => {
    expect(verifyGitHubSignature(body, "deadbeef", secret)).toBe(false);
  });

  it("returns false for a signature of the wrong length", () => {
    expect(verifyGitHubSignature(body, "sha256=ab", secret)).toBe(false);
  });
});

describe("verifyGitLabToken", () => {
  it("returns true when the token matches the secret", () => {
    expect(verifyGitLabToken("tok", "tok")).toBe(true);
  });

  it("returns false when the header is missing", () => {
    expect(verifyGitLabToken(undefined, "tok")).toBe(false);
  });

  it("returns false when the token has a different length", () => {
    expect(verifyGitLabToken("longer-token", "tok")).toBe(false);
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
    expect(mockSetConnecting).toHaveBeenCalledWith(DB, "r1", WEBHOOK_HANDLER_USER_ID);
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

  it("throws 404 when the payload has no clone URL", async () => {
    await expect(
      handlePushWebhook(DB, "github", Buffer.from("{}"), {}, {}, KEY),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(mockFindRepo).not.toHaveBeenCalled();
  });

  it("throws 404 when the clone URL cannot be normalized", async () => {
    await expect(
      handlePushWebhook(
        DB,
        "github",
        Buffer.from("{}"),
        { repository: { clone_url: "not-a-valid-url" } },
        {},
        KEY,
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(mockFindRepo).not.toHaveBeenCalled();
  });

  it("throws 404 when the repo has no stored webhook secret", async () => {
    mockFindRepo.mockResolvedValue(makeRepo(null));
    await expect(
      handlePushWebhook(
        DB,
        "github",
        Buffer.from("{}"),
        { repository: { clone_url: "https://github.com/org/repo.git" } },
        {},
        KEY,
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("throws 401 when the encryption key is unavailable", async () => {
    mockFindRepo.mockResolvedValue(makeRepo("hook-secret"));
    await expect(
      handlePushWebhook(
        DB,
        "github",
        Buffer.from("{}"),
        { repository: { clone_url: "https://github.com/org/repo.git" } },
        {},
        "",
      ),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it("throws 401 when the signature is invalid", async () => {
    mockFindRepo.mockResolvedValue(makeRepo("hook-secret"));
    await expect(
      handlePushWebhook(
        DB,
        "github",
        Buffer.from("{}"),
        { repository: { clone_url: "https://github.com/org/repo.git" } },
        { "x-hub-signature-256": "sha256=deadbeef" },
        KEY,
      ),
    ).rejects.toMatchObject({ statusCode: 401 });
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("enqueues sync for a valid GitLab token webhook", async () => {
    const secret = "gl-secret";
    mockFindRepo.mockResolvedValue(
      makeRepo(secret, {
        provider: "gitlab",
        repo_url: "https://gitlab.com/org/repo",
      }),
    );

    const rawBody = Buffer.from(
      JSON.stringify({
        ref: "refs/heads/main",
        repository: { git_http_url: "https://gitlab.com/org/repo.git" },
      }),
    );

    await handlePushWebhook(
      DB,
      "gitlab",
      rawBody,
      JSON.parse(rawBody.toString()),
      { "x-gitlab-token": secret },
      KEY,
    );

    expect(mockEnqueue).toHaveBeenCalledWith(
      DB,
      "sync",
      { repoId: "r1", trigger: "webhook_push" },
      WEBHOOK_HANDLER_USER_ID,
    );
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
