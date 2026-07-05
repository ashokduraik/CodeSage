import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act, cleanup, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import "@/i18n";
import { RepoCard } from "./RepoCard";

const mockDeleteAsync = vi.fn();

vi.mock("./useDeleteRepo", () => ({
  useDeleteRepo: () => ({
    mutateAsync: mockDeleteAsync,
    isPending: false,
  }),
}));

vi.mock("./projectsClient", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./projectsClient")>();
  return {
    ...mod,
    syncRepoRequest: vi.fn(),
  };
});

vi.mock("./IndexingLogsDialog", () => ({
  IndexingLogsDialog: ({ open }: { open: boolean }) =>
    open ? <div role="dialog">Indexing Logs</div> : null,
}));

import { syncRepoRequest } from "./projectsClient";

const mockSyncRepoRequest = vi.mocked(syncRepoRequest);

const REPO = {
  id: "r1",
  projectId: "p1",
  repoUrl: "https://github.com/org/repo",
  provider: "github" as const,
  branch: "main",
  fullName: "org/repo",
  isPrivate: false,
  connectionStatus: "connected" as const,
  webhookEnabled: true,
  lastIndexedAt: "2026-06-01T12:00:00.000Z",
  indexedFileCount: 42,
  createdAt: "2026-01-01T00:00:00.000Z",
};

/**
 * Renders RepoCard with a React Query provider so sync mutations surface errors.
 *
 * @param ui - RepoCard element to render.
 */
function renderRepoCard(ui: ReactElement): ReturnType<typeof render> {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }): JSX.Element {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return render(ui, { wrapper: Wrapper });
}

beforeEach(() => {
  mockDeleteAsync.mockReset();
  mockSyncRepoRequest.mockReset();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("RepoCard", () => {
  it("opens delete confirmation and soft-detaches on confirm", async () => {
    mockDeleteAsync.mockResolvedValue(undefined);
    renderRepoCard(<RepoCard projectId="p1" repo={REPO} />);

    fireEvent.click(screen.getByRole("button", { name: /^Delete$/i }));
    await screen.findByText(/Remove org\/repo from this project/i);
    const dialog = screen.getByRole("dialog");

    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: /^Delete$/i }));
    });

    expect(mockDeleteAsync).toHaveBeenCalledWith({ projectId: "p1", repoId: "r1" });
  }, 10_000);

  it("shows an error when soft detach fails", async () => {
    mockDeleteAsync.mockRejectedValue(new Error("API error"));
    renderRepoCard(<RepoCard projectId="p1" repo={REPO} />);

    fireEvent.click(screen.getByRole("button", { name: /^Delete$/i }));
    await screen.findByText(/Remove org\/repo from this project/i);
    const dialog = screen.getByRole("dialog");

    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: /^Delete$/i }));
    });

    await waitFor(() => {
      expect(screen.getByText(/Could not delete repository/i)).toBeTruthy();
    });
  }, 10_000);

  it("renders indexed status badge when lastIndexedAt is set", () => {
    renderRepoCard(<RepoCard projectId="p1" repo={REPO} />);
    expect(screen.getByText("Indexed")).toBeTruthy();
  });

  it("opens indexing logs dialog when button is clicked", () => {
    renderRepoCard(<RepoCard projectId="p1" repo={REPO} />);
    fireEvent.click(screen.getByRole("button", { name: /Indexing logs/i }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Indexing Logs")).toBeTruthy();
  });

  it("enables re-index when connection status is connecting", async () => {
    mockSyncRepoRequest.mockResolvedValue({ jobId: "j1" });
    renderRepoCard(
      <RepoCard
        projectId="p1"
        repo={{ ...REPO, connectionStatus: "connecting", lastIndexedAt: undefined }}
      />,
    );

    const reindexButton = screen.getByRole("button", { name: /^Re-index$/i });
    expect((reindexButton as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(reindexButton);

    await waitFor(() => {
      expect(mockSyncRepoRequest).toHaveBeenCalledWith("p1", "r1");
    });
  });

  it("shows reindexInProgress alert when API returns 409", async () => {
    const { ApiClientError } = await import("@/shared/lib/apiClient");
    mockSyncRepoRequest.mockRejectedValue(
      new ApiClientError(409, "CONFLICT", "Indexing already in progress"),
    );
    renderRepoCard(<RepoCard projectId="p1" repo={REPO} />);

    fireEvent.click(screen.getByRole("button", { name: /^Re-index$/i }));

    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert.textContent).toMatch(/already in progress/i);
    });
  });
});
