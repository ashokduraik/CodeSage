import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProjectRepoList } from "./ProjectRepoList";

vi.mock("./useProjectRepos", () => ({ useProjectRepos: vi.fn() }));
vi.mock("./RepoCard", () => ({
  RepoCard: ({ repo }: { repo: { connectionStatus: string; lastError?: string | null } }) =>
    repo.connectionStatus === "error" && repo.lastError ? (
      <span>{repo.lastError}</span>
    ) : null,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

import { useProjectRepos } from "./useProjectRepos";
const mockUseProjectRepos = vi.mocked(useProjectRepos);

describe("ProjectRepoList", () => {
  it("renders repo with error panel when connection failed", () => {
    mockUseProjectRepos.mockReturnValue({
      isPending: false,
      data: [
        {
          id: "r1",
          projectId: "p1",
          repoUrl: "https://github.com/o/r",
          provider: "github",
          branch: "main",
          fullName: "o/r",
          isPrivate: true,
          connectionStatus: "error",
          lastError: "git clone failed",
          webhookEnabled: false,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    } as unknown as ReturnType<typeof useProjectRepos>);

    render(<ProjectRepoList projectId="p1" />);
    expect(screen.getByText("git clone failed")).toBeTruthy();
  });
});
