import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Check } from "lucide-react";
import { formatRelativeTime } from "@/shared/lib/formatRelativeTime";
import { auditActionLabelKey } from "./auditActionLabels";
import type { NodeApi } from "@codesage/shared-types";

type AuditLogEntry = NodeApi.components["schemas"]["AuditLogEntry"];

/** Props for {@link AuditLogTable}. */
export interface AuditLogTableProps {
  items: AuditLogEntry[];
}

/**
 * Formats an ISO timestamp for tooltip display in the user's locale.
 *
 * @param iso - UTC ISO string.
 * @param locale - BCP 47 locale tag.
 */
function formatAbsolute(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
}

/** Copy-to-clipboard control for target values. */
function CopyTargetButton({ value }: { value: string }): JSX.Element {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable in test env */
    }
  };

  return (
    <button
      type="button"
      aria-label={t("audit.copyTarget")}
      className="ml-1 inline-flex shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
      onClick={() => void copy()}
    >
      {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
    </button>
  );
}

/** Renders actor display name with fallbacks. */
function ActorCell({ entry }: { entry: AuditLogEntry }): JSX.Element {
  const { t } = useTranslation();
  if (entry.actorEmail) {
    return <span>{entry.actorEmail}</span>;
  }
  if (entry.actorId) {
    return <span className="text-muted-foreground">{t("audit.deletedActor")}</span>;
  }
  return <span className="text-muted-foreground">{t("audit.unknownActor")}</span>;
}

/**
 * Desktop table and mobile card layouts for audit log entries.
 */
export function AuditLogTable({ items }: AuditLogTableProps): JSX.Element {
  const { t, i18n } = useTranslation();

  return (
    <>
      <div className="hidden md:block overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">{t("audit.columns.when")}</th>
              <th className="px-4 py-3 font-medium">{t("audit.columns.actor")}</th>
              <th className="px-4 py-3 font-medium">{t("audit.columns.action")}</th>
              <th className="px-4 py-3 font-medium">{t("audit.columns.target")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((entry) => (
              <tr key={entry.id} className="border-b last:border-0">
                <td className="px-4 py-3 whitespace-nowrap" title={formatAbsolute(entry.ts, i18n.language)}>
                  {formatRelativeTime(entry.ts, { locale: i18n.language })}
                </td>
                <td className="px-4 py-3">
                  <ActorCell entry={entry} />
                </td>
                <td className="px-4 py-3">{t(auditActionLabelKey(entry.action))}</td>
                <td className="px-4 py-3 font-mono text-xs">
                  {entry.target ? (
                    <span className="inline-flex items-center">
                      <span className="truncate max-w-xs">{entry.target}</span>
                      <CopyTargetButton value={entry.target} />
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-3 md:hidden">
        {items.map((entry) => (
          <li key={entry.id} className="rounded-lg border bg-card p-4 space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground" title={formatAbsolute(entry.ts, i18n.language)}>
                {formatRelativeTime(entry.ts, { locale: i18n.language })}
              </span>
              <span className="font-medium">{t(auditActionLabelKey(entry.action))}</span>
            </div>
            <div>
              <span className="text-muted-foreground">{t("audit.columns.actor")}: </span>
              <ActorCell entry={entry} />
            </div>
            {entry.target && (
              <div className="flex items-start gap-1 font-mono text-xs break-all">
                <span className="text-muted-foreground shrink-0">{t("audit.columns.target")}: </span>
                {entry.target}
                <CopyTargetButton value={entry.target} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
