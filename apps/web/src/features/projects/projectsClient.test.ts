import { describe, it, expect, vi, afterEach } from "vitest";
import {
  fetchProjects,
  createProjectRequest,
  fetchRepos,
  attachRepoRequest,
} from "./projectsClient";

vi.mock("@/shared/lib/apiClient", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "@/shared/lib/apiClient";
const mockFetch = vi.mocked(apiFetch);

afterEach(() => vi.clearAllMocks());

const TOKEN = "test-jwt";

describe("fetchProjects", () => {
  it("calls GET /projects with the token", async () => {
    mockFetch.mockResolvedValue([]);
    await fetchProjects(TOKEN);
    expect(mockFetch).toHaveBeenCalledWith("/projects", { token: TOKEN });
  });

  it("returns the resolved project array", async () => {
    const projects = [{ id: "p1", name: "Acme", status: "active", createdAt: "2026-01-01T00:00:00.000Z" }];
    mockFetch.mockResolvedValue(projects);
    expect(await fetchProjects(TOKEN)).toEqual(projects);
  });
});

describe("createProjectRequest", () => {
  it("calls POST /projects with body and token", async () => {
    const project = { id: "p1", name: "New", status: "active", createdAt: "2026-01-01T00:00:00.000Z" };
    mockFetch.mockResolvedValue(project);
    const result = await createProjectRequest(TOKEN, { name: "New" });
    expect(mockFetch).toHaveBeenCalledWith("/projects", {
      method: "POST",
      token: TOKEN,
      body: { name: "New" },
    });
    expect(result).toEqual(project);
  });
});

describe("fetchRepos", () => {
  it("calls GET /projects/:id/repos with token", async () => {
    mockFetch.mockResolvedValue([]);
    await fetchRepos(TOKEN, "p1");
    expect(mockFetch).toHaveBeenCalledWith("/projects/p1/repos", { token: TOKEN });
  });
});

describe("attachRepoRequest", () => {
  it("calls POST /projects/:id/repos with body and token", async () => {
    const response = {
      repo: { id: "r1", projectId: "p1", repoUrl: "https://github.com/o/r", provider: "github", branch: "main", role: "backend", createdAt: "2026-01-01T00:00:00.000Z" },
      jobId: "j1",
    };
    mockFetch.mockResolvedValue(response);
    const body = { repoUrl: "https://github.com/o/r", provider: "github" as const, branch: "main", role: "backend" as const };
    const result = await attachRepoRequest(TOKEN, "p1", body);
    expect(mockFetch).toHaveBeenCalledWith("/projects/p1/repos", {
      method: "POST",
      token: TOKEN,
      body,
    });
    expect(result.jobId).toBe("j1");
  });
});
