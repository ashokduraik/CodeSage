import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { NAV_ITEMS, isNavItemActive } from "./navItems";

/** Props for {@link MobileNav}. */
export interface MobileNavProps {
  /** Closes the drawer (overlay click, close button, or after navigation). */
  onClose: () => void;
}

/** Slide-over navigation drawer shown on small screens. */
export function MobileNav({ onClose }: MobileNavProps) {
  const { t } = useTranslation();
  const { pathname } = useLocation();

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button
        type="button"
        aria-label={t("nav.closeMenu")}
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <aside className="absolute left-0 top-0 bottom-0 flex w-64 flex-col bg-sidebar text-sidebar-foreground">
        <div className="flex items-center justify-between border-b border-sidebar-border p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary">
              <span className="font-mono text-sm font-bold text-sidebar-primary-foreground">CS</span>
            </div>
            <h1 className="font-heading text-lg font-semibold tracking-tight text-sidebar-accent-foreground">
              {t("app.title")}
            </h1>
          </div>
          <button
            type="button"
            aria-label={t("nav.closeMenu")}
            onClick={onClose}
            className="rounded-lg p-2 hover:bg-sidebar-accent"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {NAV_ITEMS.map((item) => {
            const active = isNavItemActive(item.path, pathname);
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={onClose}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <item.icon className="h-[18px] w-[18px]" />
                {t(item.labelKey)}
              </Link>
            );
          })}
        </nav>
      </aside>
    </div>
  );
}
