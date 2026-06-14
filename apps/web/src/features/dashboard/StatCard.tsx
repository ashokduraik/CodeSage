import type { LucideIcon } from "lucide-react";
import { cn } from "@/shared/lib/cn";

/** Accent palette options for the icon chip. */
export type StatCardColor = "primary" | "green" | "amber" | "blue";

/** Props for {@link StatCard}. */
export interface StatCardProps {
  icon: LucideIcon;
  /** Already-localized label. */
  label: string;
  value: number | string;
  /** Already-localized secondary line. */
  sublabel?: string;
  color?: StatCardColor;
}

const COLOR_CLASSES: Record<StatCardColor, string> = {
  primary: "bg-primary/10 text-primary",
  green: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  blue: "bg-blue-50 text-blue-600",
};

/** A single dashboard metric tile with an icon chip and optional sub-label. */
export function StatCard({ icon: Icon, label, value, sublabel, color = "primary" }: StatCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 transition-shadow duration-300 hover:shadow-md">
      <div className="flex items-start justify-between">
        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="font-heading text-3xl font-bold text-card-foreground">{value}</p>
          {sublabel ? <p className="text-xs text-muted-foreground">{sublabel}</p> : null}
        </div>
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-lg",
            COLOR_CLASSES[color],
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
