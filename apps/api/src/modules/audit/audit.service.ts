import type { Sql } from "../../platform/db";
import { ApiError } from "../../platform/errors";
import { AUDIT_ACTIONS } from "../../platform/audit";
import { findAuditLogs } from "./audit.repository";
import {
  DEFAULT_LOOKBACK_DAYS,
  DEFAULT_PAGE_SIZE,
  MAX_LOOKBACK_DAYS,
  MAX_OFFSET_PRODUCT,
  MAX_PAGE_SIZE,
} from "./audit.constants";
import type { NodeApi } from "@codesage/shared-types";

type AuditLogListResponse = NodeApi.components["schemas"]["AuditLogListResponse"];
type AuditAction = NodeApi.components["schemas"]["AuditAction"];

const VALID_ACTIONS = new Set<string>(Object.values(AUDIT_ACTIONS));

/** Query parameters accepted by {@link listAuditLogs}. */
export interface ListAuditLogsParams {
  actorId?: string;
  action?: string;
  tsFrom?: string;
  tsTo?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Normalizes and validates list query params; applies default 30-day window.
 *
 * @param params - Raw query string values from the route.
 * @returns Resolved date bounds, pagination, and optional filters.
 */
export function resolveAuditListParams(params: ListAuditLogsParams): {
  actorId?: string;
  action?: string;
  tsFrom: Date;
  tsTo: Date;
  page: number;
  pageSize: number;
} {
  const now = new Date();
  const tsTo = params.tsTo ? new Date(params.tsTo) : now;
  const tsFrom = params.tsFrom
    ? new Date(params.tsFrom)
    : new Date(now.getTime() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  if (Number.isNaN(tsFrom.getTime()) || Number.isNaN(tsTo.getTime())) {
    throw new ApiError(400, "VALIDATION_ERROR", "tsFrom and tsTo must be valid ISO date-times.");
  }
  if (tsFrom > tsTo) {
    throw new ApiError(400, "VALIDATION_ERROR", "tsFrom must be before or equal to tsTo.");
  }

  const rangeMs = tsTo.getTime() - tsFrom.getTime();
  const maxRangeMs = MAX_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  if (rangeMs > maxRangeMs) {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      `Date range must not exceed ${MAX_LOOKBACK_DAYS} days.`,
    );
  }

  if (params.action && !VALID_ACTIONS.has(params.action)) {
    throw new ApiError(400, "VALIDATION_ERROR", "Invalid audit action filter.");
  }

  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, params.pageSize ?? DEFAULT_PAGE_SIZE));

  if (page * pageSize > MAX_OFFSET_PRODUCT) {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      `page × pageSize must not exceed ${MAX_OFFSET_PRODUCT}. Narrow filters or date range.`,
    );
  }

  return {
    actorId: params.actorId,
    action: params.action,
    tsFrom,
    tsTo,
    page,
    pageSize,
  };
}

/**
 * Maps a DB row to the public audit log entry shape.
 *
 * @param row - Joined audit_log row.
 */
function toAuditLogEntry(row: {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  target: string | null;
  ts: Date;
}): NodeApi.components["schemas"]["AuditLogEntry"] {
  return {
    id: row.id,
    actorId: row.actor_id,
    actorEmail: row.actor_email,
    action: row.action as AuditAction,
    target: row.target,
    ts: row.ts.toISOString(),
  };
}

/**
 * Returns a paginated audit log list with hasMore (no total count query).
 *
 * @param db - postgres.js client.
 * @param params - Raw query parameters from the HTTP request.
 */
export async function listAuditLogs(
  db: Sql,
  params: ListAuditLogsParams,
): Promise<AuditLogListResponse> {
  const resolved = resolveAuditListParams(params);
  const offset = (resolved.page - 1) * resolved.pageSize;
  const rows = await findAuditLogs(
    db,
    {
      actorId: resolved.actorId,
      action: resolved.action,
      tsFrom: resolved.tsFrom,
      tsTo: resolved.tsTo,
    },
    resolved.pageSize + 1,
    offset,
  );

  const hasMore = rows.length > resolved.pageSize;
  const items = rows.slice(0, resolved.pageSize).map(toAuditLogEntry);

  return {
    items,
    page: resolved.page,
    pageSize: resolved.pageSize,
    hasMore,
    tsFrom: resolved.tsFrom.toISOString(),
    tsTo: resolved.tsTo.toISOString(),
  };
}
