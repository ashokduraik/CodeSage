/** Time divisions in ascending size, used to pick the most natural unit. */
const DIVISIONS: ReadonlyArray<{ amount: number; unit: Intl.RelativeTimeFormatUnit }> = [
  { amount: 60, unit: "second" },
  { amount: 60, unit: "minute" },
  { amount: 24, unit: "hour" },
  { amount: 7, unit: "day" },
  { amount: 4.34524, unit: "week" },
  { amount: 12, unit: "month" },
];

/** Options controlling how a timestamp is formatted relative to "now". */
export interface RelativeTimeOptions {
  /** Reference point to measure against. Defaults to the current time. */
  now?: Date;
  /** BCP-47 locale tag for wording (e.g. "en", "fr"). Defaults to "en". */
  locale?: string;
}

/**
 * Formats a UTC timestamp as a locale-aware relative string (e.g. "5 minutes ago").
 * Uses the built-in `Intl.RelativeTimeFormat`, so wording is localized rather than
 * hardcoded. Past times are negative, future times positive.
 * @param date - An ISO-8601 string or Date to format (interpreted as UTC when a string).
 * @param options - Optional reference time and locale; see {@link RelativeTimeOptions}.
 * @returns A localized relative-time phrase.
 */
export function formatRelativeTime(date: string | Date, options: RelativeTimeOptions = {}): string {
  const target = typeof date === "string" ? new Date(date) : date;
  const now = options.now ?? new Date();
  const formatter = new Intl.RelativeTimeFormat(options.locale ?? "en", { numeric: "auto" });

  let duration = (target.getTime() - now.getTime()) / 1000;
  for (const division of DIVISIONS) {
    if (Math.abs(duration) < division.amount) {
      return formatter.format(Math.round(duration), division.unit);
    }
    duration /= division.amount;
  }
  return formatter.format(Math.round(duration), "year");
}
