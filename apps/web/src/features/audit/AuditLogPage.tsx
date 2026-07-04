import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { ScrollText } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Select } from "@/shared/ui/select";
import { AuditLogFilters } from "./AuditLogFilters";
import { AuditLogTable } from "./AuditLogTable";
import { AuditLogTableSkeleton } from "./AuditLogTableSkeleton";
import { useAuditLogs } from "./useAuditLogs";
import {
  defaultAuditLogUrlState,
  parseAuditLogUrlState,
  presetToRange,
  serializeAuditLogUrlState,
  type AuditLogUrlState,
} from "./useAuditLogUrlState";

/**
 * Applies preset date ranges unless the admin chose a custom window.
 *
 * @param state - Filter state to normalize.
 */
function resolveRange(state: AuditLogUrlState): AuditLogUrlState {
  if (state.preset === "custom") {
    return state;
  }
  const range = presetToRange(state.preset);
  return { ...state, tsFrom: range.tsFrom, tsTo: range.tsTo };
}

/**
 * Admin audit log viewer with URL-synced filters and hasMore pagination.
 */
export function AuditLogPage(): JSX.Element {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  const applied = parseAuditLogUrlState(searchParams);

  const applyState = (next: AuditLogUrlState): void => {
    setSearchParams(serializeAuditLogUrlState(next), { replace: true });
  };

  const queryParams = {
    actorId: applied.actorId || undefined,
    action: applied.action || undefined,
    tsFrom: applied.tsFrom || undefined,
    tsTo: applied.tsTo || undefined,
    page: applied.page,
    pageSize: applied.pageSize,
  };

  const { data, isPending, isFetching, isError, refetch } = useAuditLogs(queryParams);

  const items = data?.items ?? [];
  const hasMore = data?.hasMore ?? false;
  const start = items.length === 0 ? 0 : (applied.page - 1) * applied.pageSize + 1;
  const end = start === 0 ? 0 : start + items.length - 1;
  const showDeepPageHint = applied.page > 20;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 lg:p-8">
      <div className="flex items-start gap-3">
        <ScrollText className="mt-1 h-6 w-6 text-muted-foreground" aria-hidden />
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">{t("audit.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("audit.subtitle")}</p>
        </div>
      </div>

      <AuditLogFilters
        key={searchParams.toString()}
        applied={applied}
        onApply={(draft) => applyState({ ...resolveRange(draft), page: 1 })}
        onPresetApply={(draft) => applyState({ ...resolveRange(draft), page: 1 })}
        onClearAll={() => applyState(defaultAuditLogUrlState())}
        onRemoveChip={(field) => {
          const next =
            field === "actor"
              ? { ...applied, actorId: "", actorEmail: "", page: 1 }
              : { ...applied, action: "", page: 1 };
          applyState(next);
        }}
      />

      {isError && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm"
        >
          <span>{t("audit.loadError")}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
            {t("audit.retry")}
          </Button>
        </div>
      )}

      {isPending && !data && <AuditLogTableSkeleton />}

      {!isPending && data && items.length === 0 && (
        <p className="py-12 text-center text-sm text-muted-foreground">{t("audit.empty")}</p>
      )}

      {items.length > 0 && (
        <div className={isFetching ? "opacity-60 transition-opacity" : ""}>
          <AuditLogTable items={items} />
        </div>
      )}

      {(items.length > 0 || applied.page > 1) && (
        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {items.length > 0
              ? t("audit.pagination.summary", { start, end })
              : t("audit.pagination.emptyPage")}
            {hasMore && ` ${t("audit.pagination.moreAvailable")}`}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">{t("audit.pagination.pageSize")}</span>
              <Select
                className="w-20"
                value={String(applied.pageSize)}
                onChange={(e) => applyState({ ...applied, pageSize: Number(e.target.value), page: 1 })}
              >
                {[25, 50, 100].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </Select>
            </label>
            <span className="text-sm text-muted-foreground">
              {t("audit.pagination.page", { page: applied.page })}
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={applied.page <= 1}
                onClick={() => applyState({ ...applied, page: applied.page - 1 })}
              >
                {t("audit.pagination.previous")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!hasMore}
                onClick={() => applyState({ ...applied, page: applied.page + 1 })}
              >
                {t("audit.pagination.next")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showDeepPageHint && (
        <p className="text-xs text-muted-foreground">{t("audit.pagination.deepPageHint")}</p>
      )}
    </div>
  );
}
