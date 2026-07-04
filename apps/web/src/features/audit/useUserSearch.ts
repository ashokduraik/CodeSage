import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth";
import { searchUsersRequest, userSearchQueryKey } from "./auditClient";
import type { NodeApi } from "@codesage/shared-types";

type UserSearchResult = NodeApi.components["schemas"]["UserSearchResult"];

/**
 * Debounced user prefix search for actor autocomplete.
 *
 * @param query - Email prefix typed by the admin.
 * @param debouncedQuery - Debounced value (caller's responsibility).
 */
export function useUserSearch(debouncedQuery: string) {
  const { user } = useAuth();
  const trimmed = debouncedQuery.trim();
  const enabled = Boolean(user) && user?.role === "admin" && trimmed.length >= 2;

  return useQuery<UserSearchResult[]>({
    queryKey: [...userSearchQueryKey, trimmed] as const,
    queryFn: () => searchUsersRequest(trimmed),
    enabled,
    staleTime: 30_000,
  });
}
