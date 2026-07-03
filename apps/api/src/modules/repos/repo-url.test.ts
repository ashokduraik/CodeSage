import { describe, it, expect } from "vitest";
import { parseRepoUrl } from "./repo-url";

describe("parseRepoUrl", () => {
  it("parses a GitHub HTTPS URL", () => {
    const info = parseRepoUrl("https://github.com/org/repo");
    expect(info).toMatchObject({
      provider: "github",
      fullName: "org/repo",
      normalizedUrl: "https://github.com/org/repo",
    });
  });

  it("parses a self-hosted GitLab URL", () => {
    const info = parseRepoUrl("https://git.corp.example.com/group/project");
    expect(info).toMatchObject({
      provider: "gitlab",
      isSelfHosted: true,
      baseUrl: "https://git.corp.example.com",
    });
  });

  it("returns null for invalid URLs", () => {
    expect(parseRepoUrl("not-a-url")).toBeNull();
    expect(parseRepoUrl("http://github.com/org/repo")).toBeNull();
  });
});
