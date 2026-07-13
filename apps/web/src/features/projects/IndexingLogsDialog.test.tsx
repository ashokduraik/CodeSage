import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@/i18n";
import { IndexingLogsDialog } from "./IndexingLogsDialog";

const mockUseRepoIndexingEvents = vi.fn();

vi.mock("./useRepoIndexingEvents", () => ({
  useRepoIndexingEvents: (...args: unknown[]) => mockUseRepoIndexingEvents(...args),
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
  createdAt: "2026-01-01T00:00:00.000Z",
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("IndexingLogsDialog", () => {
  it("renders event rows with message and failure reason", () => {
    mockUseRepoIndexingEvents.mockReturnValue({
      data: {
        pages: [
          {
            items: [
              {
                id: "e1",
                runId: "run-1",
                step: "embed",
                phase: "failed",
                startedAt: "2026-07-04T14:36:00.000Z",
                durationMs: 120,
                message: "Generating embeddings...",
                failureReason: "Embedding service unavailable",
              },
            ],
            limit: 50,
            hasMore: false,
            nextCursor: null,
          },
        ],
      },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });

    render(
      <IndexingLogsDialog open projectId="p1" repo={REPO} onOpenChange={vi.fn()} />,
    );

    expect(screen.getByText("Indexing Logs")).toBeTruthy();
    expect(screen.getByText("org/repo")).toBeTruthy();
    expect(screen.getByText("Generating embeddings...")).toBeTruthy();
    expect(screen.getByText("Embedding service unavailable")).toBeTruthy();
    expect(screen.getByText("120 ms")).toBeTruthy();
  });

  it("shows duration on finished events", () => {
    mockUseRepoIndexingEvents.mockReturnValue({
      data: {
        pages: [
          {
            items: [
              {
                id: "e2",
                runId: "run-1",
                step: "sync",
                phase: "finished",
                startedAt: "2026-07-04T14:36:00.000Z",
                durationMs: 374,
                message: "Repository download complete.",
              },
            ],
            limit: 50,
            hasMore: true,
            nextCursor: "cursor-1",
          },
        ],
      },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
      fetchNextPage: vi.fn(),
      hasNextPage: true,
      isFetchingNextPage: false,
    });

    render(
      <IndexingLogsDialog open projectId="p1" repo={REPO} onOpenChange={vi.fn()} />,
    );

    expect(screen.getByText("374 ms")).toBeTruthy();
    expect(screen.getByText(/Scroll down for older events/i)).toBeTruthy();
  });

  it("shows empty state when there are no events", () => {
    mockUseRepoIndexingEvents.mockReturnValue({
      data: { pages: [{ items: [], limit: 50, hasMore: false, nextCursor: null }] },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });

    render(
      <IndexingLogsDialog open projectId="p1" repo={REPO} onOpenChange={vi.fn()} />,
    );

    expect(screen.getByText(/No indexing activity yet/i)).toBeTruthy();
  });

  it("renders friendly step labels with technical terms in parentheses", () => {
    mockUseRepoIndexingEvents.mockReturnValue({
      data: {
        pages: [
          {
            items: [
              {
                id: "e-distill",
                runId: "run-2",
                step: "distill",
                phase: "finished",
                startedAt: "2026-07-04T14:40:00.000Z",
                durationMs: 1000,
                message: "Built project knowledge — 0 workflows, 0 pages, 0 permissions, 0 data flows",
              },
              {
                id: "e-parse",
                runId: "run-1",
                step: "parse",
                phase: "finished",
                startedAt: "2026-07-04T14:35:00.000Z",
                durationMs: 200,
                message: "Read 12 files, created 40 code sections",
              },
            ],
            limit: 50,
            hasMore: false,
            nextCursor: null,
          },
        ],
      },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });

    render(
      <IndexingLogsDialog open projectId="p1" repo={REPO} onOpenChange={vi.fn()} />,
    );

    expect(screen.getByText("Build Project Knowledge (Distillation)")).toBeTruthy();
    expect(screen.getByText("Read Files (Parsing)")).toBeTruthy();
  });
});
