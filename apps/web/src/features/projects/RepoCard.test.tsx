import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import "@/i18n";
import { RepoCard } from "./RepoCard";

const mockDeleteAsync = vi.fn();
const mockSyncAsync = vi.fn();

vi.mock("./useDeleteRepo", () => ({
  useDeleteRepo: () => ({
    mutateAsync: mockDeleteAsync,
    isPending: false,
  }),
}));

vi.mock("./useSyncRepo", () => ({
  useSyncRepo: () => ({
    mutateAsync: mockSyncAsync,
    isPending: false,
  }),
}));

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

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("RepoCard", () => {
  it("opens delete confirmation and soft-detaches on confirm", async () => {
    mockDeleteAsync.mockResolvedValue(undefined);
    render(<RepoCard projectId="p1" repo={REPO} />);

    fireEvent.click(screen.getByRole("button", { name: /^Delete$/i }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/Remove org\/repo from this project/i)).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: /^Delete$/i }));

    await waitFor(() => {
      expect(mockDeleteAsync).toHaveBeenCalledWith({ projectId: "p1", repoId: "r1" });
    });
  });

  it("shows an error when soft detach fails", async () => {
    mockDeleteAsync.mockRejectedValue(new Error("API error"));
    render(<RepoCard projectId="p1" repo={REPO} />);

    fireEvent.click(screen.getByRole("button", { name: /^Delete$/i }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^Delete$/i }));

    await waitFor(() => {
      expect(screen.getByText(/Could not delete repository/i)).toBeTruthy();
    });
  });

  it("renders indexed status badge when lastIndexedAt is set", () => {
    render(<RepoCard projectId="p1" repo={REPO} />);
    expect(screen.getByText("Indexed")).toBeTruthy();
  });
});
