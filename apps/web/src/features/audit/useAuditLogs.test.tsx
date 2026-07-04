import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { HookWrapper } from "@/test/utils";
import { useAuditLogs } from "./useAuditLogs";

vi.mock("./auditClient", () => ({
  auditLogsQueryKeyFor: vi.fn((p) => ["audit-logs", p]),
  fetchAuditLogs: vi.fn(),
}));

import { fetchAuditLogs } from "./auditClient";

const mockFetch = vi.mocked(fetchAuditLogs);

afterEach(() => vi.clearAllMocks());

describe("useAuditLogs", () => {
  it("fetches audit logs when enabled for admin", async () => {
    mockFetch.mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 25,
      hasMore: false,
      tsFrom: "2026-06-01T00:00:00.000Z",
      tsTo: "2026-07-01T00:00:00.000Z",
    });
    const admin = {
      id: "u1",
      email: "admin@example.com",
      role: "admin" as const,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <HookWrapper user={admin}>{children}</HookWrapper>
    );
    const { result } = renderHook(
      () => useAuditLogs({ page: 1, pageSize: 25 }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalled();
  });
});
