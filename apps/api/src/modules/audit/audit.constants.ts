/** Default lookback when the client omits tsFrom/tsTo (days). */
export const DEFAULT_LOOKBACK_DAYS = 30;

/** Maximum allowed date-range span (days). */
export const MAX_LOOKBACK_DAYS = 365;

/** Maximum page × pageSize product to limit deep offset scans. */
export const MAX_OFFSET_PRODUCT = 10_000;

/** Default rows per page. */
export const DEFAULT_PAGE_SIZE = 25;

/** Maximum rows per page. */
export const MAX_PAGE_SIZE = 100;
