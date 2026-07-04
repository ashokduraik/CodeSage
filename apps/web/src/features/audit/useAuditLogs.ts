import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth";
import { auditLogsQueryKeyFor, fetchAuditLogs, type AuditLogQueryParams } from "./auditClient";
import type { NodeApi } from "@codesage/shared-types";

type AuditLogListResponse = NodeApi.components["schemas"]["AuditLogListResponse"];

/**
 * Fetches paginated audit logs with previous-page placeholder during page changes.
 *
 * @param params - Active filter and pagination (typically from URL state).
 * @param enabled - When false, skips the fetch (e.g. draft filters before Search).
 */
export function useAuditLogs(params: AuditLogQueryParams, enabled = true) {
  const { user } = useAuth();

  return useQuery<AuditLogListResponse>({
    queryKey: auditLogsQueryKeyFor(params),
    queryFn: () => fetchAuditLogs(params),
    enabled: Boolean(user) && user?.role === "admin" && enabled,
    placeholderData: keepPreviousData,
  });
}
