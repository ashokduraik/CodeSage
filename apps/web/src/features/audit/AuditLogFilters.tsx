import { useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Select } from "@/shared/ui/select";
import { cn } from "@/shared/lib/cn";
import { ActorAutocomplete } from "./ActorAutocomplete";
import { AUDIT_ACTIONS, auditActionLabelKey } from "./auditActionLabels";
import type { AuditDatePreset, AuditLogUrlState } from "./useAuditLogUrlState";
import { presetToRange } from "./useAuditLogUrlState";

/** Props for {@link AuditLogFilters}. */
export interface AuditLogFiltersProps {
  applied: AuditLogUrlState;
  onApply: (draft: AuditLogUrlState) => void;
  onPresetApply: (draft: AuditLogUrlState) => void;
  onClearAll: () => void;
  onRemoveChip: (field: "actor" | "action") => void;
}

const PRESETS: readonly AuditDatePreset[] = ["24h", "7d", "30d", "90d", "custom"];

/**
 * Filter bar with date presets, actor/action filters, active chips, and Search/Clear.
 */
export function AuditLogFilters({
  applied,
  onApply,
  onPresetApply,
  onClearAll,
  onRemoveChip,
}: AuditLogFiltersProps): JSX.Element {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(applied);

  const setPreset = (preset: AuditDatePreset): void => {
    const next =
      preset === "custom"
        ? { ...draft, preset, page: 1 }
        : { ...draft, preset, page: 1, ...presetToRange(preset) };
    setDraft(next);
    if (preset !== "custom") {
      onPresetApply(next);
    }
  };

  const hasActorChip = Boolean(applied.actorId);
  const hasActionChip = Boolean(applied.action);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm transition-colors",
              draft.preset === preset
                ? "border-primary bg-primary text-primary-foreground"
                : "hover:bg-accent",
            )}
            onClick={() => setPreset(preset)}
          >
            {t(`audit.presets.${preset}`)}
          </button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">{t("audit.filters.actor")}</label>
          <ActorAutocomplete
            key={`${draft.actorId}-${draft.actorEmail}`}
            value={draft.actorId}
            displayEmail={draft.actorEmail}
            onChange={(actorId, email) => setDraft({ ...draft, actorId, actorEmail: email })}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">{t("audit.filters.action")}</label>
          <Select
            value={draft.action}
            onChange={(e) => setDraft({ ...draft, action: e.target.value })}
          >
            <option value="">{t("audit.filters.allActions")}</option>
            {AUDIT_ACTIONS.map((action) => (
              <option key={action} value={action}>
                {t(auditActionLabelKey(action))}
              </option>
            ))}
          </Select>
        </div>
        {draft.preset === "custom" && (
          <>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">{t("audit.filters.from")}</label>
              <Input
                type="datetime-local"
                value={toLocalInputValue(draft.tsFrom)}
                onChange={(e) =>
                  setDraft({ ...draft, tsFrom: fromLocalInputValue(e.target.value) })
                }
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">{t("audit.filters.to")}</label>
              <Input
                type="datetime-local"
                value={toLocalInputValue(draft.tsTo)}
                onChange={(e) =>
                  setDraft({ ...draft, tsTo: fromLocalInputValue(e.target.value) })
                }
              />
            </div>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={() => onApply(draft)}>
          {t("audit.filters.search")}
        </Button>
        <Button type="button" variant="outline" onClick={onClearAll}>
          {t("audit.filters.clearAll")}
        </Button>
      </div>

      {(hasActorChip || hasActionChip) && (
        <div className="flex flex-wrap gap-2">
          {hasActorChip && (
            <span className="inline-flex items-center gap-1 rounded-full border bg-muted px-3 py-1 text-xs">
              {t("audit.chips.actor", { email: applied.actorEmail || applied.actorId })}
              <button type="button" aria-label={t("audit.chips.removeActor")} onClick={() => onRemoveChip("actor")}>
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {hasActionChip && (
            <span className="inline-flex items-center gap-1 rounded-full border bg-muted px-3 py-1 text-xs">
              {t("audit.chips.action", {
                action: t(auditActionLabelKey(applied.action as (typeof AUDIT_ACTIONS)[number])),
              })}
              <button type="button" aria-label={t("audit.chips.removeAction")} onClick={() => onRemoveChip("action")}>
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Converts an ISO string to a value suitable for datetime-local inputs.
 *
 * @param iso - UTC ISO timestamp.
 */
function toLocalInputValue(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Converts a datetime-local input value to ISO UTC.
 *
 * @param local - Value from datetime-local input.
 */
function fromLocalInputValue(local: string): string {
  if (!local) return "";
  return new Date(local).toISOString();
}
