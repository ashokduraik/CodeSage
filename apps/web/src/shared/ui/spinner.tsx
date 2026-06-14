import { cn } from "@/shared/lib/cn";

/** Indeterminate loading spinner using the design's primary accent. */
export function Spinner({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary",
        className,
      )}
    />
  );
}
