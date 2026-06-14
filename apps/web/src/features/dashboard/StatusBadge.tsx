import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";
import type { ProjectStatus } from "@/shared/mock";

const STATUS_CLASSES: Record<ProjectStatus, string> = {
  indexed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  indexing: "bg-blue-50 text-blue-700 border-blue-200",
  connecting: "bg-amber-50 text-amber-700 border-amber-200",
  error: "bg-rose-50 text-rose-700 border-rose-200",
  stale: "bg-orange-50 text-orange-700 border-orange-200",
};

/** Statuses that represent in-progress work and show a pulsing dot. */
const PULSING: ReadonlySet<ProjectStatus> = new Set(["indexing", "connecting"]);

/** Props for {@link StatusBadge}. */
export interface StatusBadgeProps {
  status: ProjectStatus;
}

/** Pill showing a project's indexing status with a localized label. */
export function StatusBadge({ status }: StatusBadgeProps) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
        STATUS_CLASSES[status],
      )}
    >
      {PULSING.has(status) ? (
        <span className="mr-1.5 h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
      ) : null}
      {t(`status.${status}`)}
    </span>
  );
}
