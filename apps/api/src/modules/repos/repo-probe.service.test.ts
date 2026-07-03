import { describe, it, expect, vi, afterEach } from "vitest";
import { probeRepo, probeGithubRepo, probeGitlabRepo } from "./repo-probe.service";
import { parseRepoUrl } from "./repo-url";

afterEach(() => vi.restoreAllMocks());

describe("probeGithubRepo", () => {
  it("returns authRequired on 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ status: 401, ok: false }),
    );
    const parsed = parseRepoUrl("https://github.com/org/repo")!;
    const result = await probeGithubRepo(parsed);
    expect(result.authRequired).toBe(true);
  });

  it("returns repo metadata description when available", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          json: async () => ({
            default_branch: "main",
            description: "meta",
            private: false,
            language: "Python",
          }),
        })
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          json: async () => [{ name: "main" }, { name: "dev" }],
        }),
    );
    const parsed = parseRepoUrl("https://github.com/org/repo")!;
    const result = await probeGithubRepo(parsed);
    expect(result.branches).toEqual(["main", "dev"]);
    expect(result.description).toBe("meta");
    expect(result.primaryLanguage).toBe("Python");
  });

  it("falls back to the first README section when metadata is empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          json: async () => ({
            default_branch: "main",
            description: null,
            private: false,
          }),
        })
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          json: async () => [{ name: "main" }, { name: "dev" }],
        })
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          json: async () => ({
            content: Buffer.from(
              "# Hello\n\nIntro paragraph.\n\n## Features\n\nMore text.",
            ).toString("base64"),
          }),
        }),
    );
    const parsed = parseRepoUrl("https://github.com/org/repo")!;
    const result = await probeGithubRepo(parsed);
    expect(result.description).toBe("Intro paragraph.");
  });
});

describe("probeGitlabRepo", () => {
  it("returns authRequired on 403", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ status: 403, ok: false }),
    );
    const parsed = parseRepoUrl("https://gitlab.com/group/project")!;
    const result = await probeGitlabRepo(parsed);
    expect(result.authRequired).toBe(true);
  });

  it("returns repo metadata description when available", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          json: async () => ({
            default_branch: "main",
            description: "gitlab meta",
            visibility: "private",
          }),
        })
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          json: async () => [{ name: "main" }],
        })
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          json: async () => ({ Python: 80, TypeScript: 20 }),
        }),
    );
    const parsed = parseRepoUrl("https://gitlab.com/group/project")!;
    const result = await probeGitlabRepo(parsed, "token");
    expect(result.branches).toEqual(["main"]);
    expect(result.description).toBe("gitlab meta");
    expect(result.isPrivate).toBe(true);
    expect(result.primaryLanguage).toBe("Python");
  });

  it("falls back to the first README section when metadata is empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          json: async () => ({
            default_branch: "main",
            description: "",
            visibility: "private",
          }),
        })
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          json: async () => [{ name: "main" }],
        })
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          text: async () => "# GitLab README\n\nIntro text.\n\n## Features\n\nMore.",
        })
        .mockResolvedValueOnce({
          status: 404,
          ok: false,
        }),
    );
    const parsed = parseRepoUrl("https://gitlab.com/group/project")!;
    const result = await probeGitlabRepo(parsed, "token");
    expect(result.description).toBe("Intro text.");
  });
});

describe("probeRepo", () => {
  it("throws ApiError for invalid URL", async () => {
    await expect(probeRepo("not-valid")).rejects.toMatchObject({ statusCode: 400 });
  });

  it("returns notFound when provider returns 404 with token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ status: 404, ok: false }),
    );
    const result = await probeRepo("https://github.com/org/missing", "token");
    expect(result.notFound).toBe(true);
  });
});
