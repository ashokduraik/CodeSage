import { describe, it, expect, vi, afterEach } from "vitest";
import {
  fetchProjects,
  createProjectRequest,
  fetchRepos,
  attachRepoRequest,
  probeRepoRequest,
  deleteProjectRequest,
  deleteRepoRequest,
  fetchRepoIndexingEvents,
  syncRepoRequest,
} from "./projectsClient";

vi.mock("@/shared/lib/apiClient", () => ({
  apiFetch: vi.fn(),
  ApiClientError: class ApiClientError extends Error {
    readonly status: number;
    readonly code: string;
    constructor(status: number, code: string, message: string) {
      super(message);
      this.name = "ApiClientError";
      this.status = status;
      this.code = code;
    }
  },
}));

import { apiFetch } from "@/shared/lib/apiClient";
const mockFetch = vi.mocked(apiFetch);

afterEach(() => vi.clearAllMocks());

describe("probeRepoRequest", () => {
  it("calls POST /repos/probe with body", async () => {
    mockFetch.mockResolvedValue({
      provider: "github",
      fullName: "o/r",
      defaultBranch: "main",
      branches: ["main"],
      description: "",
      isPrivate: false,
      authRequired: false,
      notFound: false,
    });
    await probeRepoRequest({ repoUrl: "https://github.com/o/r" });
    expect(mockFetch).toHaveBeenCalledWith("/repos/probe", {
      method: "POST",
      body: { repoUrl: "https://github.com/o/r" },
    });
  });
});

describe("attachRepoRequest", () => {
  it("calls POST /projects/:id/repos with body", async () => {
    const response = {
      repo: {
        id: "r1",
        projectId: "p1",
        repoUrl: "https://github.com/o/r",
        provider: "github",
        branch: "main",
        fullName: "o/r",
        isPrivate: false,
        connectionStatus: "connecting",
        webhookEnabled: false,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      jobId: "j1",
    };
    mockFetch.mockResolvedValue(response);
    const body = { repoUrl: "https://github.com/o/r", branch: "main" };
    const result = await attachRepoRequest("p1", body);
    expect(mockFetch).toHaveBeenCalledWith("/projects/p1/repos", {
      method: "POST",
      body,
    });
    expect(result.jobId).toBe("j1");
  });
});

describe("fetchRepos", () => {
  it("calls GET /projects/:id/repos", async () => {
    mockFetch.mockResolvedValue([]);
    await fetchRepos("p1");
    expect(mockFetch).toHaveBeenCalledWith("/projects/p1/repos");
  });
});

describe("fetchProjects", () => {
  it("calls GET /projects", async () => {
    mockFetch.mockResolvedValue([]);
    await fetchProjects();
    expect(mockFetch).toHaveBeenCalledWith("/projects");
  });
});

describe("createProjectRequest", () => {
  it("calls POST /projects with body", async () => {
    const project = { id: "p1", name: "New", status: "active", createdAt: "2026-01-01T00:00:00.000Z" };
    mockFetch.mockResolvedValue(project);
    await createProjectRequest({ name: "New" });
    expect(mockFetch).toHaveBeenCalledWith("/projects", {
      method: "POST",
      body: { name: "New" },
    });
  });
});

describe("deleteProjectRequest", () => {
  it("calls DELETE /projects/:id for soft delete", async () => {
    mockFetch.mockResolvedValue(undefined);
    await deleteProjectRequest("p1");
    expect(mockFetch).toHaveBeenCalledWith("/projects/p1", { method: "DELETE" });
  });
});

describe("deleteRepoRequest", () => {
  it("calls DELETE /projects/:projectId/repos/:repoId for soft detach", async () => {
    mockFetch.mockResolvedValue(undefined);
    await deleteRepoRequest("p1", "r1");
    expect(mockFetch).toHaveBeenCalledWith("/projects/p1/repos/r1", { method: "DELETE" });
  });
});

describe("syncRepoRequest", () => {
  it("calls POST /projects/:projectId/repos/:repoId/sync", async () => {
    mockFetch.mockResolvedValue({ jobId: "job-sync" });
    const result = await syncRepoRequest("p1", "r1");
    expect(mockFetch).toHaveBeenCalledWith("/projects/p1/repos/r1/sync", { method: "POST" });
    expect(result.jobId).toBe("job-sync");
  });

  it("propagates ApiClientError when API returns 409", async () => {
    const { ApiClientError } = await import("@/shared/lib/apiClient");
    mockFetch.mockRejectedValue(
      new ApiClientError(409, "CONFLICT", "Indexing already in progress"),
    );
    await expect(syncRepoRequest("p1", "r1")).rejects.toMatchObject({
      status: 409,
      code: "CONFLICT",
    });
  });
});

describe("fetchRepoIndexingEvents", () => {
  it("builds limit and cursor query string", async () => {
    mockFetch.mockResolvedValue({
      items: [],
      limit: 50,
      hasMore: false,
      nextCursor: null,
    });
    await fetchRepoIndexingEvents("p1", "r1", { limit: 50, cursor: "abc123" });
    expect(mockFetch).toHaveBeenCalledWith(
      "/projects/p1/repos/r1/indexing-events?limit=50&cursor=abc123",
    );
  });

  it("calls endpoint without query when params omitted", async () => {
    mockFetch.mockResolvedValue({
      items: [],
      limit: 50,
      hasMore: false,
      nextCursor: null,
    });
    await fetchRepoIndexingEvents("p1", "r1");
    expect(mockFetch).toHaveBeenCalledWith("/projects/p1/repos/r1/indexing-events");
  });
});
