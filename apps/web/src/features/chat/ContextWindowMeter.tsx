import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";

/** Props for {@link ContextWindowMeter}. */
export interface ContextWindowMeterProps {
  /** Context tokens consumed in the latest grounded answer. */
  usedTokens: number;
  /** Detected or configured max context window of the connected model. */
  maxTokens: number;
}

/**
 * Formats a token count compactly for the header meter (e.g. 2100 -> "2.1K").
 * @param value - Raw token count.
 * @param locale - Active i18n locale for number formatting.
 */
function formatCompact(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(
    value,
  );
}

/**
 * Shows context window usage at the top of the chat, updated from the latest
 * assistant response metrics.
 */
export function ContextWindowMeter({ usedTokens, maxTokens }: ContextWindowMeterProps) {
  const { t, i18n } = useTranslation();
  const usedLabel = formatCompact(usedTokens, i18n.language);
  const maxLabel = formatCompact(maxTokens, i18n.language);
  const ratio = maxTokens > 0 ? Math.min(usedTokens / maxTokens, 1) : 0;

  return (
    <div
      className="flex min-w-[8rem] flex-col gap-1"
      aria-label={t("chat.contextMeter.ariaLabel", { used: usedLabel, max: maxLabel })}
    >
      <div className="flex items-baseline justify-end gap-1 font-mono text-[10px] text-muted-foreground">
        <span className="font-medium text-foreground">{t("chat.contextMeter.label")}</span>
        <span>
          {t("chat.contextMeter.value", {
            used: usedLabel,
            max: maxLabel,
          })}
        </span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full bg-primary transition-all duration-300")}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
    </div>
  );
}
