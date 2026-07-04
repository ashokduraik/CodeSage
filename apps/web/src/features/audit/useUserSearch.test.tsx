import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { HookWrapper } from "@/test/utils";
import { useUserSearch } from "./useUserSearch";

vi.mock("./auditClient", () => ({
  userSearchQueryKey: ["users", "search"],
  searchUsersRequest: vi.fn(),
}));

import { searchUsersRequest } from "./auditClient";

const mockSearch = vi.mocked(searchUsersRequest);

afterEach(() => vi.clearAllMocks());

describe("useUserSearch", () => {
  it("does not fetch when query is too short", () => {
    const admin = {
      id: "u1",
      email: "admin@example.com",
      role: "admin" as const,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const wrapper = ({ children }: { children: ReactNode }) => (
      <HookWrapper user={admin}>{children}</HookWrapper>
    );
    renderHook(() => useUserSearch("a"), { wrapper });
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it("fetches when query has two or more characters", async () => {
    mockSearch.mockResolvedValue([]);
    const admin = {
      id: "u1",
      email: "admin@example.com",
      role: "admin" as const,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const wrapper = ({ children }: { children: ReactNode }) => (
      <HookWrapper user={admin}>{children}</HookWrapper>
    );
    const { result } = renderHook(() => useUserSearch("al"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockSearch).toHaveBeenCalledWith("al");
  });
});
