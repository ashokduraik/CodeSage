import { useQuery } from "@tanstack/react-query";
import { getHealth, type HealthResult } from "./api";

/** Stable query key for the API health check — used to cache and invalidate the result. */
export const HEALTH_QUERY_KEY = ["health"] as const;

/**
 * React Query hook that fetches and caches the API health status.
 * Does not retry on failure (health checks are used for immediate status feedback).
 * @returns The TanStack Query result for the health endpoint, typed as {@link HealthResult}.
 */
export function useHealth() {
  return useQuery<HealthResult, Error>({
    queryKey: HEALTH_QUERY_KEY,
    queryFn: () => getHealth(),
    retry: false,
  });
}
