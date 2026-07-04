import type { TFunction } from "i18next";
import type { NodeApi } from "@codesage/shared-types";

type RepoIndexingEvent = NodeApi.components["schemas"]["RepoIndexingEvent"];

/** Maps DB sync step to UI label key; fetch/clone resolved from event details. */
const STEP_LABEL_KEYS: Record<RepoIndexingEvent["step"], string> = {
  sync: "sync",
  parse: "parse",
  embed: "embed",
};

/** Maps DB phase to UI status label key (started → running, finished → success). */
const PHASE_LABEL_KEYS: Record<RepoIndexingEvent["phase"], string> = {
  started: "running",
  finished: "success",
  failed: "failed",
  skipped: "skipped",
};

const TERMINAL_PHASES = new Set<RepoIndexingEvent["phase"]>([
  "finished",
  "failed",
  "skipped",
]);

/**
 * Returns the i18n key suffix for an indexing event step label.
 *
 * @param step - Event step from the API.
 * @param syncMode - Optional sync mode from event details (`clone` or `fetch`).
 * @returns Key suffix under projects.repoCard.indexingLogsSteps.
 */
export function indexingEventStepLabelKey(
  step: RepoIndexingEvent["step"],
  syncMode?: string,
): string {
  if (step === "sync" && (syncMode === "fetch" || syncMode === "clone")) {
    return syncMode;
  }
  return STEP_LABEL_KEYS[step];
}

/**
 * Returns the i18n key suffix for an indexing event phase/status label.
 *
 * @param phase - Event phase from the API.
 * @returns Key suffix under projects.repoCard.indexingLogsPhases.
 */
export function indexingEventPhaseLabelKey(phase: RepoIndexingEvent["phase"]): string {
  return PHASE_LABEL_KEYS[phase];
}

/**
 * Resolves step duration from the API row or optional details fallback.
 *
 * @param event - Indexing event from the API.
 * @returns Duration in milliseconds when known.
 */
export function resolveIndexingEventDurationMs(event: RepoIndexingEvent): number | undefined {
  if (event.durationMs !== undefined && event.durationMs >= 0) {
    return event.durationMs;
  }
  const elapsed = event.details?.elapsed_ms;
  if (typeof elapsed === "number" && elapsed >= 0) {
    return elapsed;
  }
  return undefined;
}

/**
 * Whether duration should be shown for this event phase.
 *
 * @param phase - Event phase from the API.
 * @returns True for finished, failed, or skipped phases.
 */
export function shouldShowIndexingEventDuration(phase: RepoIndexingEvent["phase"]): boolean {
  return TERMINAL_PHASES.has(phase);
}

/**
 * Returns the localized step label for one indexing event.
 *
 * @param event - Indexing event from the API.
 * @param t - i18n translate function.
 * @returns Localized step name (Clone, Fetch, Parse, Embed).
 */
export function formatIndexingEventStepLabel(event: RepoIndexingEvent, t: TFunction): string {
  const syncMode =
    typeof event.details?.sync_mode === "string" ? event.details.sync_mode : undefined;
  return t(
    `projects.repoCard.indexingLogsSteps.${indexingEventStepLabelKey(event.step, syncMode)}`,
  );
}

/**
 * Returns the localized status label for one indexing event.
 *
 * @param event - Indexing event from the API.
 * @param t - i18n translate function.
 * @returns Localized status (Running, Success, Failed, Skipped).
 */
export function formatIndexingEventPhaseLabel(event: RepoIndexingEvent, t: TFunction): string {
  return t(
    `projects.repoCard.indexingLogsPhases.${indexingEventPhaseLabelKey(event.phase)}`,
  );
}

/**
 * Formats the bold title line for one indexing log row.
 *
 * @param event - Indexing event from the API.
 * @param t - i18n translate function.
 * @returns Localized "{step} — {status}" title.
 */
export function formatIndexingEventTitle(event: RepoIndexingEvent, t: TFunction): string {
  return `${formatIndexingEventStepLabel(event, t)} — ${formatIndexingEventPhaseLabel(event, t)}`;
}

/**
 * Formats an absolute timestamp for indexing log rows.
 *
 * @param iso - UTC ISO timestamp from the API.
 * @param locale - BCP 47 locale (e.g. from i18n.language).
 * @returns Locale-aware date/time string.
 */
export function formatIndexingEventTimestamp(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/**
 * Formats duration in milliseconds for display.
 *
 * @param durationMs - Step duration from the API.
 * @returns Human-readable duration (e.g. "374 ms", "2.4 s", "1 min 5 s").
 */
export function formatIndexingEventDuration(durationMs: number): string {
  if (durationMs < 1000) {
    return `${durationMs} ms`;
  }
  if (durationMs < 60_000) {
    const seconds = durationMs / 1000;
    return seconds < 10 ? `${seconds.toFixed(1)} s` : `${Math.round(seconds)} s`;
  }
  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.round((durationMs % 60_000) / 1000);
  return seconds > 0 ? `${minutes} min ${seconds} s` : `${minutes} min`;
}

/** Tailwind classes for phase status badges. */
export const INDEXING_PHASE_BADGE_CLASSES: Record<RepoIndexingEvent["phase"], string> = {
  started: "border-amber-200 bg-amber-50 text-amber-800",
  finished: "border-emerald-200 bg-emerald-50 text-emerald-800",
  failed: "border-rose-200 bg-rose-50 text-rose-800",
  skipped: "border-slate-200 bg-slate-50 text-slate-600",
};

/** Left accent border color per pipeline step. */
export const INDEXING_STEP_ACCENT_CLASSES: Record<RepoIndexingEvent["step"], string> = {
  sync: "border-l-sky-500",
  parse: "border-l-violet-500",
  embed: "border-l-emerald-500",
};
