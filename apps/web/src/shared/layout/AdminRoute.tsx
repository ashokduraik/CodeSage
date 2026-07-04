import { Navigate, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "@/features/auth";
import { Spinner } from "@/shared/ui/spinner";

/**
 * Route guard requiring admin role. Unauthenticated users go to login;
 * authenticated non-admins see an access-denied message.
 */
export function AdminRoute(): JSX.Element {
  const { t } = useTranslation();
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== "admin") {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <ShieldAlert className="h-10 w-10 text-muted-foreground" aria-hidden />
        <h1 className="text-lg font-semibold">{t("audit.accessDenied.title")}</h1>
        <p className="max-w-md text-sm text-muted-foreground">{t("audit.accessDenied.body")}</p>
      </div>
    );
  }

  return <Outlet />;
}
