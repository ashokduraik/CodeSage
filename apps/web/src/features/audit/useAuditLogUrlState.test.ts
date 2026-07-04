import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  defaultAuditLogUrlState,
  parseAuditLogUrlState,
  presetToRange,
  serializeAuditLogUrlState,
} from "./useAuditLogUrlState";

describe("useAuditLogUrlState helpers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-04T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("defaultAuditLogUrlState uses 30-day preset", () => {
    const state = defaultAuditLogUrlState();
    expect(state.preset).toBe("30d");
    expect(state.page).toBe(1);
    expect(state.pageSize).toBe(25);
  });

  it("presetToRange computes 7-day window", () => {
    const { tsFrom, tsTo } = presetToRange("7d");
    expect(tsTo).toBe("2026-07-04T12:00:00.000Z");
    expect(tsFrom).toBe("2026-06-27T12:00:00.000Z");
  });

  it("round-trips state through URL params", () => {
    const state = {
      ...defaultAuditLogUrlState(),
      actorId: "u1",
      actorEmail: "admin@example.com",
      action: "project.create",
      page: 2,
    };
    const params = serializeAuditLogUrlState(state);
    const parsed = parseAuditLogUrlState(params);
    expect(parsed.actorId).toBe("u1");
    expect(parsed.action).toBe("project.create");
    expect(parsed.page).toBe(2);
  });

  it("uses default range when custom preset lacks explicit dates", () => {
    const params = new URLSearchParams({ preset: "custom" });
    const parsed = parseAuditLogUrlState(params);
    expect(parsed.preset).toBe("custom");
    expect(parsed.tsFrom).toBeTruthy();
    expect(parsed.tsTo).toBeTruthy();
  });
});
