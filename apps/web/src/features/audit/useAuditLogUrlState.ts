/** Date-range preset identifiers for the audit log filter bar. */
export type AuditDatePreset = "24h" | "7d" | "30d" | "90d" | "custom";

/** URL-synced audit log filter and pagination state. */
export interface AuditLogUrlState {
  actorId: string;
  actorEmail: string;
  action: string;
  tsFrom: string;
  tsTo: string;
  page: number;
  pageSize: number;
  preset: AuditDatePreset;
}

export const DEFAULT_PAGE_SIZE = 25;

/** Default preset applied on first visit. */
export const DEFAULT_PRESET: Exclude<AuditDatePreset, "custom"> = "30d";

/**
 * Returns ISO bounds for a date preset ending at `now`.
 *
 * @param preset - Preset identifier (not `custom`).
 * @param now - Reference time (defaults to current time).
 */
export function presetToRange(
  preset: Exclude<AuditDatePreset, "custom">,
  now = new Date(),
): { tsFrom: string; tsTo: string } {
  const tsTo = now.toISOString();
  const ms =
    preset === "24h"
      ? 24 * 60 * 60 * 1000
      : preset === "7d"
        ? 7 * 24 * 60 * 60 * 1000
        : preset === "30d"
          ? 30 * 24 * 60 * 60 * 1000
          : 90 * 24 * 60 * 60 * 1000;
  const tsFrom = new Date(now.getTime() - ms).toISOString();
  return { tsFrom, tsTo };
}

/**
 * Parses audit log state from URL search params with sensible defaults.
 *
 * @param params - Current URL search params.
 */
export function parseAuditLogUrlState(params: URLSearchParams): AuditLogUrlState {
  const preset = (params.get("preset") as AuditDatePreset | null) ?? DEFAULT_PRESET;
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.get("pageSize") ?? String(DEFAULT_PAGE_SIZE)) || DEFAULT_PAGE_SIZE));

  let tsFrom = params.get("tsFrom") ?? "";
  let tsTo = params.get("tsTo") ?? "";

  if (preset !== "custom") {
    const range = presetToRange(preset);
    tsFrom = range.tsFrom;
    tsTo = range.tsTo;
  } else if (!tsFrom || !tsTo) {
    const range = presetToRange(DEFAULT_PRESET);
    tsFrom = range.tsFrom;
    tsTo = range.tsTo;
  }

  return {
    actorId: params.get("actorId") ?? "",
    actorEmail: params.get("actorEmail") ?? "",
    action: params.get("action") ?? "",
    tsFrom,
    tsTo,
    page,
    pageSize,
    preset,
  };
}

/**
 * Serializes audit log state into URL search params.
 *
 * @param state - Filter and pagination state.
 */
export function serializeAuditLogUrlState(state: AuditLogUrlState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.actorId) {
    params.set("actorId", state.actorId);
    if (state.actorEmail) params.set("actorEmail", state.actorEmail);
  }
  if (state.action) params.set("action", state.action);
  params.set("tsFrom", state.tsFrom);
  params.set("tsTo", state.tsTo);
  params.set("page", String(state.page));
  params.set("pageSize", String(state.pageSize));
  params.set("preset", state.preset);
  return params;
}

/**
 * Returns default audit log URL state for a fresh visit.
 */
export function defaultAuditLogUrlState(): AuditLogUrlState {
  const range = presetToRange(DEFAULT_PRESET);
  return {
    actorId: "",
    actorEmail: "",
    action: "",
    tsFrom: range.tsFrom,
    tsTo: range.tsTo,
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    preset: DEFAULT_PRESET,
  };
}
