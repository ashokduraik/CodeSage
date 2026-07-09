import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  REPOS_POLL_MS,
  shouldPollProjectRepos,
  useProjectRepos,
} from "./useProjectRepos";
import type { NodeApi } from "@codesage/shared-types";

type Repo = NodeApi.components["schemas"]["Repo"];

vi.mock("./projectsClient", () => ({
  fetchRepos: vi.fn(),
  reposQueryKey: (projectId: string) => ["projects", projectId, "repos"],
}));

import { fetchRepos } from "./projectsClient";

const mockFetch = vi.mocked(fetchRepos);

const BASE_REPO: Repo = {
  id: "r1",
  projectId: "p1",
  repoUrl: "https://github.com/org/repo",
  provider: "github",
  branch: "main",
  fullName: "org/repo",
  isPrivate: false,
  webhookEnabled: false,
  connectionStatus: "connected",
  createdAt: "2026-01-01T00:00:00.000Z",
};

function wrapper(client: QueryClient) {
  return function QueryWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

afterEach(() => vi.clearAllMocks());

describe("shouldPollProjectRepos", () => {
  it("returns true when parent project is indexing", () => {
    expect(shouldPollProjectRepos([], "indexing")).toBe(true);
  });

  it("returns true when any repo is connecting", () => {
    expect(
      shouldPollProjectRepos([{ ...BASE_REPO, connectionStatus: "connecting" }], "indexed"),
    ).toBe(true);
  });

  it("returns false when project is indexed and repos are idle", () => {
    expect(shouldPollProjectRepos([BASE_REPO], "indexed")).toBe(false);
  });
});

describe("useProjectRepos", () => {
  it("fetches repos for a project", async () => {
    mockFetch.mockResolvedValue([BASE_REPO]);

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(
      () => useProjectRepos({ projectId: "p1", projectStatus: "indexed" }),
      { wrapper: wrapper(client) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith("p1");
    expect(result.current.data).toHaveLength(1);
  });

  it("uses polling interval when project status is indexing", async () => {
    mockFetch.mockResolvedValue([BASE_REPO]);

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(
      () => useProjectRepos({ projectId: "p1", projectStatus: "indexing" }),
      { wrapper: wrapper(client) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(REPOS_POLL_MS).toBe(5000);
    expect(shouldPollProjectRepos(result.current.data, "indexing")).toBe(true);
  });
});
