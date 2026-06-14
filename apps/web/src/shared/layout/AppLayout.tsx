import { useState } from "react";
import { Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Menu } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { MobileNav } from "./MobileNav";

/** App chrome: fixed sidebar on desktop, top bar + slide-over nav on mobile. */
export function AppLayout() {
  const { t } = useTranslation();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      <div className="fixed left-0 right-0 top-0 z-40 flex h-14 items-center border-b border-border bg-card px-4 lg:hidden">
        <button
          type="button"
          aria-label={t("nav.openMenu")}
          onClick={() => setMobileOpen(true)}
          className="rounded-lg p-2 hover:bg-muted"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="ml-3 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
            <span className="font-mono text-xs font-bold text-primary-foreground">CS</span>
          </div>
          <span className="font-heading text-sm font-semibold">{t("app.title")}</span>
        </div>
      </div>

      {mobileOpen && <MobileNav onClose={() => setMobileOpen(false)} />}

      <main className="min-h-screen pt-14 lg:ml-64 lg:pt-0">
        <Outlet />
      </main>
    </div>
  );
}
