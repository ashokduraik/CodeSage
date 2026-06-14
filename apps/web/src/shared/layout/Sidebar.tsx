import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/cn";
import { NAV_ITEMS, isNavItemActive } from "./navItems";

/** Fixed left navigation rail shown on large screens. */
export function Sidebar() {
  const { t } = useTranslation();
  const { pathname } = useLocation();

  return (
    <aside className="fixed left-0 top-0 bottom-0 z-50 flex w-64 flex-col bg-sidebar text-sidebar-foreground">
      <div className="border-b border-sidebar-border p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary">
            <span className="font-mono text-sm font-bold text-sidebar-primary-foreground">CS</span>
          </div>
          <div>
            <h1 className="font-heading text-lg font-semibold tracking-tight text-sidebar-accent-foreground">
              {t("app.title")}
            </h1>
            <p className="text-[11px] uppercase tracking-wide text-sidebar-foreground/60">
              {t("app.tagline")}
            </p>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {NAV_ITEMS.map((item) => {
          const active = isNavItemActive(item.path, pathname);
          return (
            <Link
              key={item.path}
              to={item.path}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md shadow-sidebar-primary/20"
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
  );
}
