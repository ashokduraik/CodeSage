import { describe, it, expect } from "vitest";
import { formatRelativeTime } from "./formatRelativeTime";

const NOW = new Date("2026-06-14T12:00:00.000Z");

describe("formatRelativeTime", () => {
  it('formats a moment ago as "now"', () => {
    expect(formatRelativeTime(NOW, { now: NOW })).toBe("now");
  });

  it("formats minutes in the past", () => {
    const fiveMinAgo = new Date(NOW.getTime() - 5 * 60_000);
    expect(formatRelativeTime(fiveMinAgo, { now: NOW })).toBe("5 minutes ago");
  });

  it("formats hours in the past", () => {
    const threeHoursAgo = new Date(NOW.getTime() - 3 * 3_600_000);
    expect(formatRelativeTime(threeHoursAgo, { now: NOW })).toBe("3 hours ago");
  });

  it("formats days in the past", () => {
    const twoDaysAgo = new Date(NOW.getTime() - 2 * 86_400_000);
    expect(formatRelativeTime(twoDaysAgo, { now: NOW })).toBe("2 days ago");
  });

  it("formats weeks in the past", () => {
    const twoWeeksAgo = new Date(NOW.getTime() - 14 * 86_400_000);
    expect(formatRelativeTime(twoWeeksAgo, { now: NOW })).toBe("2 weeks ago");
  });

  it("formats months in the past", () => {
    const twoMonthsAgo = new Date(NOW.getTime() - 60 * 86_400_000);
    expect(formatRelativeTime(twoMonthsAgo, { now: NOW })).toBe("2 months ago");
  });

  it("falls back to years for distant dates", () => {
    const twoYearsAgo = new Date(NOW.getTime() - 2 * 365 * 86_400_000);
    expect(formatRelativeTime(twoYearsAgo, { now: NOW })).toBe("2 years ago");
  });

  it("accepts an ISO string and a future time", () => {
    const inTenMinutes = new Date(NOW.getTime() + 10 * 60_000).toISOString();
    expect(formatRelativeTime(inTenMinutes, { now: NOW })).toBe("in 10 minutes");
  });

  it("uses the current time as the default reference", () => {
    expect(formatRelativeTime(new Date())).toBe("now");
  });
});
