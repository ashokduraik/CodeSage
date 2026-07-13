import { describe, it, expect } from "vitest";
import type { TFunction } from "i18next";
import {
  indexingEventStepLabelKey,
  indexingEventPhaseLabelKey,
  formatIndexingEventTitle,
  formatIndexingEventDuration,
  formatIndexingEventTimestamp,
  resolveIndexingEventDurationMs,
  shouldShowIndexingEventDuration,
} from "./indexingEventDisplay";

const t = ((key: string) => key) as TFunction;

describe("indexingEventDisplay", () => {
  it("maps sync step to default sync label key", () => {
    expect(indexingEventStepLabelKey("sync")).toBe("sync");
    expect(indexingEventStepLabelKey("parse")).toBe("parse");
    expect(indexingEventStepLabelKey("embed")).toBe("embed");
    expect(indexingEventStepLabelKey("distill")).toBe("distill");
  });

  it("maps sync step to fetch or clone when details provide sync_mode", () => {
    expect(indexingEventStepLabelKey("sync", "fetch")).toBe("fetch");
    expect(indexingEventStepLabelKey("sync", "clone")).toBe("clone");
    expect(indexingEventStepLabelKey("sync", "other")).toBe("sync");
  });

  it("maps phases to UI status label keys", () => {
    expect(indexingEventPhaseLabelKey("started")).toBe("running");
    expect(indexingEventPhaseLabelKey("finished")).toBe("success");
    expect(indexingEventPhaseLabelKey("failed")).toBe("failed");
    expect(indexingEventPhaseLabelKey("skipped")).toBe("skipped");
  });

  it("formats title from step and phase", () => {
    const title = formatIndexingEventTitle(
      {
        id: "e1",
        runId: "r1",
        step: "embed",
        phase: "finished",
        startedAt: "2026-07-04T14:36:00.000Z",
        message: "Done",
      },
      t,
    );
    expect(title).toContain("embed");
    expect(title).toContain("success");
  });

  it("formats distill title with distill step key", () => {
    const title = formatIndexingEventTitle(
      {
        id: "e2",
        runId: "r2",
        step: "distill",
        phase: "started",
        startedAt: "2026-07-04T14:36:00.000Z",
        message: "Building project knowledge from indexed code",
      },
      t,
    );
    expect(title).toContain("distill");
    expect(title).toContain("running");
  });

  it("formats sub-second duration in milliseconds", () => {
    expect(formatIndexingEventDuration(374)).toBe("374 ms");
  });

  it("formats longer durations in seconds", () => {
    expect(formatIndexingEventDuration(2400)).toBe("2.4 s");
    expect(formatIndexingEventDuration(45000)).toBe("45 s");
  });

  it("resolves duration from details.elapsed_ms fallback", () => {
    expect(
      resolveIndexingEventDurationMs({
        id: "e1",
        runId: "r1",
        step: "sync",
        phase: "finished",
        startedAt: "2026-07-04T14:36:00.000Z",
        message: "Done",
        details: { elapsed_ms: 500 },
      }),
    ).toBe(500);
  });

  it("shows duration only for terminal phases", () => {
    expect(shouldShowIndexingEventDuration("started")).toBe(false);
    expect(shouldShowIndexingEventDuration("finished")).toBe(true);
  });

  it("formats timestamp with locale", () => {
    const formatted = formatIndexingEventTimestamp("2026-07-04T14:36:00.000Z", "en-US");
    expect(formatted.length).toBeGreaterThan(0);
  });
});
