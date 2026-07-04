import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

vi.mock("./audit.repository", () => ({
  findAuditLogs: vi.fn(),
}));

const { listAuditLogs, resolveAuditListParams } = await import("./audit.service");
import { findAuditLogs } from "./audit.repository";
import type { Sql } from "../../platform/db";

const mockFind = vi.mocked(findAuditLogs);
const DB = {} as Sql;

afterEach(() => vi.clearAllMocks());

describe("resolveAuditListParams", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-04T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("applies default 30-day window when dates omitted", () => {
    const result = resolveAuditListParams({});
    expect(result.tsTo.toISOString()).toBe("2026-07-04T12:00:00.000Z");
    expect(result.tsFrom.toISOString()).toBe("2026-06-04T12:00:00.000Z");
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(25);
  });

  it("throws when tsFrom is invalid", () => {
    expect(() => resolveAuditListParams({ tsFrom: "not-a-date" })).toThrow(/valid ISO/);
  });

  it("throws when tsFrom is after tsTo", () => {
    expect(() =>
      resolveAuditListParams({
        tsFrom: "2026-07-05T00:00:00.000Z",
        tsTo: "2026-07-04T00:00:00.000Z",
      }),
    ).toThrow(/tsFrom must be before/);
  });

  it("throws when range exceeds 365 days", () => {
    expect(() =>
      resolveAuditListParams({
        tsFrom: "2024-01-01T00:00:00.000Z",
        tsTo: "2026-07-04T12:00:00.000Z",
      }),
    ).toThrow(/365 days/);
  });

  it("throws when page offset product exceeds cap", () => {
    expect(() => resolveAuditListParams({ page: 500, pageSize: 25 })).toThrow(/page × pageSize/);
  });

  it("rejects unknown action filters", () => {
    expect(() => resolveAuditListParams({ action: "invalid.action" })).toThrow(/Invalid audit action/);
  });
});

describe("listAuditLogs", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-04T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const ROW = {
    id: "a1",
    actor_id: "u1",
    actor_email: "admin@example.com",
    action: "project.create",
    target: "p1",
    ts: new Date("2026-07-04T10:00:00.000Z"),
  };

  it("returns hasMore true when extra row fetched", async () => {
    mockFind.mockResolvedValue([ROW, { ...ROW, id: "a2" }]);
    const result = await listAuditLogs(DB, { pageSize: 1 });
    expect(result.items).toHaveLength(1);
    expect(result.hasMore).toBe(true);
    expect(mockFind).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tsFrom: expect.any(Date), tsTo: expect.any(Date) }),
      2,
      0,
    );
  });

  it("returns hasMore false on last page", async () => {
    mockFind.mockResolvedValue([ROW]);
    const result = await listAuditLogs(DB, {});
    expect(result.hasMore).toBe(false);
    expect(result.items[0]?.action).toBe("project.create");
  });
});
