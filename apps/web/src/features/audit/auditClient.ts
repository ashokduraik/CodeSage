import { apiFetch } from "@/shared/lib/apiClient";
import type { NodeApi } from "@codesage/shared-types";

type AuditLogListResponse = NodeApi.components["schemas"]["AuditLogListResponse"];
type UserSearchResult = NodeApi.components["schemas"]["UserSearchResult"];

/** Query parameters for listing audit logs. */
export interface AuditLogQueryParams {
  actorId?: string;
  action?: string;
  tsFrom?: string;
  tsTo?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Builds a query string from audit list parameters, omitting empty values.
 *
 * @param params - Filter and pagination values.
 */
export function buildAuditLogQuery(params: AuditLogQueryParams): string {
  const search = new URLSearchParams();
  if (params.actorId) search.set("actorId", params.actorId);
  if (params.action) search.set("action", params.action);
  if (params.tsFrom) search.set("tsFrom", params.tsFrom);
  if (params.tsTo) search.set("tsTo", params.tsTo);
  if (params.page !== undefined) search.set("page", String(params.page));
  if (params.pageSize !== undefined) search.set("pageSize", String(params.pageSize));
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

/**
 * Fetches a paginated audit log list from the Node API.
 *
 * @param params - Filter and pagination values.
 */
export async function fetchAuditLogs(params: AuditLogQueryParams): Promise<AuditLogListResponse> {
  return apiFetch<AuditLogListResponse>(`/audit-logs${buildAuditLogQuery(params)}`);
}

/**
 * Prefix-searches users for actor autocomplete.
 *
 * @param query - Email prefix (min 2 chars).
 * @param limit - Max results.
 */
export async function searchUsersRequest(query: string, limit = 10): Promise<UserSearchResult[]> {
  const qs = new URLSearchParams({ q: query, limit: String(limit) });
  return apiFetch<UserSearchResult[]>(`/users/search?${qs.toString()}`);
}

/** React Query key prefix for audit log lists. */
export const auditLogsQueryKey = ["audit-logs"] as const;

/**
 * Builds a stable React Query key for an audit log request.
 *
 * @param params - Filter and pagination values.
 */
export function auditLogsQueryKeyFor(params: AuditLogQueryParams): readonly unknown[] {
  return [...auditLogsQueryKey, params] as const;
}

/** React Query key prefix for user search. */
export const userSearchQueryKey = ["users", "search"] as const;
