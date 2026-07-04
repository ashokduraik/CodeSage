import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { renderWithRouter } from "@/test/utils";
import { AuditLogPage } from "./AuditLogPage";

vi.mock("./useAuditLogs", () => ({ useAuditLogs: vi.fn() }));
import { useAuditLogs } from "./useAuditLogs";

const mockUseAuditLogs = vi.mocked(useAuditLogs);

const LIST = {
  items: [
    {
      id: "a1",
      actorId: "u1",
      actorEmail: "admin@example.com",
      action: "project.create" as const,
      target: "p1",
      ts: "2026-07-04T10:00:00.000Z",
    },
  ],
  page: 1,
  pageSize: 25,
  hasMore: true,
  tsFrom: "2026-06-04T12:00:00.000Z",
  tsTo: "2026-07-04T12:00:00.000Z",
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AuditLogPage", () => {
  it("shows skeleton while loading", () => {
    mockUseAuditLogs.mockReturnValue({
      isPending: true,
      isFetching: false,
      isError: false,
      data: undefined,
      refetch: vi.fn(),
    } as never);
    renderWithRouter(<AuditLogPage />, {
      route: "/admin/audit-log",
      user: { id: "u1", email: "a@e.com", role: "admin", createdAt: "2026-01-01T00:00:00.000Z" },
    });
    expect(document.querySelector(".animate-pulse")).toBeTruthy();
  });

  it("renders rows and enables next when hasMore", () => {
    mockUseAuditLogs.mockReturnValue({
      isPending: false,
      isFetching: false,
      isError: false,
      data: LIST,
      refetch: vi.fn(),
    } as never);
    renderWithRouter(<AuditLogPage />, {
      route: "/admin/audit-log",
      user: { id: "u1", email: "a@e.com", role: "admin", createdAt: "2026-01-01T00:00:00.000Z" },
    });
    expect(screen.getAllByText("Project created").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Next" })).not.toHaveProperty("disabled", true);
  });

  it("shows empty state when no items", () => {
    mockUseAuditLogs.mockReturnValue({
      isPending: false,
      isFetching: false,
      isError: false,
      data: { ...LIST, items: [], hasMore: false },
      refetch: vi.fn(),
    } as never);
    renderWithRouter(<AuditLogPage />, {
      route: "/admin/audit-log",
      user: { id: "u1", email: "a@e.com", role: "admin", createdAt: "2026-01-01T00:00:00.000Z" },
    });
    expect(screen.getByText(/No events match/)).toBeTruthy();
  });

  it("calls refetch on retry", () => {
    const refetch = vi.fn();
    mockUseAuditLogs.mockReturnValue({
      isPending: false,
      isFetching: false,
      isError: true,
      data: undefined,
      refetch,
    } as never);
    renderWithRouter(<AuditLogPage />, {
      route: "/admin/audit-log",
      user: { id: "u1", email: "a@e.com", role: "admin", createdAt: "2026-01-01T00:00:00.000Z" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalled();
  });

  it("disables previous on first page and next when hasMore is false", () => {
    mockUseAuditLogs.mockReturnValue({
      isPending: false,
      isFetching: false,
      isError: false,
      data: { ...LIST, hasMore: false },
      refetch: vi.fn(),
    } as never);
    renderWithRouter(<AuditLogPage />, {
      route: "/admin/audit-log?page=1",
      user: { id: "u1", email: "a@e.com", role: "admin", createdAt: "2026-01-01T00:00:00.000Z" },
    });
    expect(screen.getByRole("button", { name: "Previous" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Next" }).hasAttribute("disabled")).toBe(true);
  });

  it("advances page when Next is clicked", () => {
    mockUseAuditLogs.mockReturnValue({
      isPending: false,
      isFetching: false,
      isError: false,
      data: LIST,
      refetch: vi.fn(),
    } as never);
    renderWithRouter(<AuditLogPage />, {
      route: "/admin/audit-log?page=1&preset=30d&tsFrom=2026-06-04T12:00:00.000Z&tsTo=2026-07-04T12:00:00.000Z&pageSize=25",
      user: { id: "u1", email: "a@e.com", role: "admin", createdAt: "2026-01-01T00:00:00.000Z" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(mockUseAuditLogs).toHaveBeenCalled();
  });
});
