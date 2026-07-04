import { describe, it, expect, vi, afterEach } from "vitest";
import { buildAuditLogQuery, fetchAuditLogs, searchUsersRequest } from "./auditClient";

vi.mock("@/shared/lib/apiClient", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "@/shared/lib/apiClient";

const mockApiFetch = vi.mocked(apiFetch);

afterEach(() => vi.clearAllMocks());

describe("buildAuditLogQuery", () => {
  it("serializes filter and pagination params", () => {
    const qs = buildAuditLogQuery({
      actorId: "u1",
      action: "repo.attach",
      tsFrom: "2026-06-01T00:00:00.000Z",
      tsTo: "2026-07-01T00:00:00.000Z",
      page: 2,
      pageSize: 50,
    });
    expect(qs).toContain("actorId=u1");
    expect(qs).toContain("action=repo.attach");
    expect(qs).toContain("page=2");
    expect(qs).toContain("pageSize=50");
  });

  it("returns empty string when no params", () => {
    expect(buildAuditLogQuery({})).toBe("");
  });
});

describe("fetchAuditLogs", () => {
  it("calls apiFetch with built query string", async () => {
    mockApiFetch.mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 25,
      hasMore: false,
      tsFrom: "2026-06-01T00:00:00.000Z",
      tsTo: "2026-07-01T00:00:00.000Z",
    });
    await fetchAuditLogs({ page: 2, pageSize: 50 });
    expect(mockApiFetch).toHaveBeenCalledWith("/audit-logs?page=2&pageSize=50");
  });
});

describe("searchUsersRequest", () => {
  it("calls user search endpoint with encoded query", async () => {
    mockApiFetch.mockResolvedValue([]);
    await searchUsersRequest("al", 5);
    expect(mockApiFetch).toHaveBeenCalledWith("/users/search?q=al&limit=5");
  });
});
