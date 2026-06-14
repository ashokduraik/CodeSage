import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/features/auth";
import { Spinner } from "@/shared/ui/spinner";

/**
 * Route guard that redirects unauthenticated visitors to `/login`.
 * While the initial session restore is in progress, renders a full-page spinner
 * to avoid a flash of the login page for users with a stored token.
 *
 * Usage: wrap protected `<Route>` elements with this component as the parent `element`.
 */
export function ProtectedRoute(): JSX.Element {
  const { token, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
