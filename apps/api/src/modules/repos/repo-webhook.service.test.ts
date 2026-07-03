import { describe, it, expect, vi, afterEach } from "vitest";
import {
  generateWebhookSecret,
  registerRepoWebhook,
  tokenHelpInfo,
  deleteGitHubWebhook,
  unregisterRepoWebhook,
} from "./repo-webhook.service";
import { parseRepoUrl } from "./repo-url";

afterEach(() => vi.restoreAllMocks());

describe("generateWebhookSecret", () => {
  it("returns a 64-char hex string", () => {
    expect(generateWebhookSecret()).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("tokenHelpInfo", () => {
  it("returns GitHub help URL", () => {
    const info = tokenHelpInfo("github", "https://github.com", false);
    expect(info.url).toContain("github.com/settings/tokens");
  });

  it("returns self-hosted GitLab help URL", () => {
    const info = tokenHelpInfo("gitlab", "https://git.corp.example.com", true);
    expect(info.url).toContain("git.corp.example.com");
  });
});

describe("registerRepoWebhook", () => {
  it("returns disabled when webhook base URL is missing", async () => {
    const parsed = parseRepoUrl("https://github.com/org/repo")!;
    const result = await registerRepoWebhook(parsed, "token", "github", "", "key");
    expect(result.webhookEnabled).toBe(false);
  });

  it("registers GitHub webhook when configured", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ id: 42 }),
      }),
    );
    const key = Buffer.alloc(32, 1).toString("base64");
    const parsed = parseRepoUrl("https://github.com/org/repo")!;
    const result = await registerRepoWebhook(
      parsed,
      "ghp_test",
      "github",
      "https://codesage.example.com",
      key,
    );
    expect(result.webhookEnabled).toBe(true);
    expect(result.webhookId).toBe("42");
    expect(result.webhookSecretEnc).toBeTruthy();
  });

  it("returns disabled when registration fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 403, text: async () => "forbidden" }),
    );
    const key = Buffer.alloc(32, 1).toString("base64");
    const parsed = parseRepoUrl("https://github.com/org/repo")!;
    const result = await registerRepoWebhook(
      parsed,
      "ghp_test",
      "github",
      "https://codesage.example.com",
      key,
    );
    expect(result.webhookEnabled).toBe(false);
  });

  it("registers GitLab webhook when configured", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ id: 7 }),
      }),
    );
    const key = Buffer.alloc(32, 1).toString("base64");
    const parsed = parseRepoUrl("https://gitlab.com/group/project")!;
    const result = await registerRepoWebhook(
      parsed,
      "glpat-test",
      "gitlab",
      "https://codesage.example.com",
      key,
    );
    expect(result.webhookEnabled).toBe(true);
  });
});

describe("deleteGitHubWebhook", () => {
  it("ignores 404 responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const parsed = parseRepoUrl("https://github.com/org/repo")!;
    await expect(deleteGitHubWebhook(parsed, "token", "1")).resolves.toBeUndefined();
  });
});

describe("unregisterRepoWebhook", () => {
  it("no-ops when webhook id is missing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const parsed = parseRepoUrl("https://github.com/org/repo")!;
    await unregisterRepoWebhook(parsed, "github", "token", null);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
