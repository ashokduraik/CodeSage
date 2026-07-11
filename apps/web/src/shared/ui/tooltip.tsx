import { useId, useState, type ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

interface TooltipProps {
  /** Text shown inside the tooltip bubble. */
  content: string;
  /** Trigger element the tooltip describes (usually an icon). */
  children: ReactNode;
  /** Optional extra classes for the inline wrapper. */
  className?: string;
}

/**
 * Lightweight, dependency-free tooltip shown on hover and keyboard focus.
 *
 * Renders its trigger inline and reveals an accessible bubble (role="tooltip",
 * wired via aria-describedby) positioned above the trigger. Intended for short
 * helper text on icon-only affordances.
 *
 * @param content - Text to display in the tooltip bubble.
 * @param children - The trigger element (e.g. an icon).
 * @param className - Optional classes applied to the inline wrapper.
 * @returns The trigger wrapped with hover/focus tooltip behavior.
 */
export function Tooltip({ content, children, className }: TooltipProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();

  return (
    <span
      className={cn("relative inline-flex", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span
        tabIndex={0}
        aria-describedby={open ? tooltipId : undefined}
        className="inline-flex rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {children}
      </span>
      {open ? (
        <span
          role="tooltip"
          id={tooltipId}
          className="absolute bottom-full left-1/2 z-50 mb-2 w-60 -translate-x-1/2 rounded-md bg-slate-900 px-3 py-2 text-left text-[11px] font-normal leading-relaxed text-white shadow-lg"
        >
          {content}
        </span>
      ) : null}
    </span>
  );
}
