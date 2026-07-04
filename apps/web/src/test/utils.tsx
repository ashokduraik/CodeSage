import type { ReactElement, ReactNode } from "react";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthContext, type AuthContextValue } from "@/features/auth/AuthContext";
import type { NodeApi } from "@codesage/shared-types";
import "../i18n"; // ensure i18next is initialised before any component renders

type User = NodeApi.components["schemas"]["User"];

/** Creates a QueryClient with retries disabled for deterministic tests. */
export function makeClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

/** Options for {@link renderWithRouter}. */
export interface RenderWithRouterOptions {
  /** Initial history entry. Defaults to "/". */
  route?: string;
  /** When set, `ui` is mounted under a `<Route path>` so `useParams` resolves. */
  path?: string;
  /** Authenticated user for components that call {@link useAuth}. */
  user?: User | null;
}

function authValue(user: User | null | undefined): AuthContextValue {
  return {
    user: user ?? null,
    isLoading: false,
    sessionExpired: false,
    login: async () => {},
    logout: () => {},
  };
}

/**
 * Renders `ui` wrapped in a QueryClient and MemoryRouter. When `path` is given,
 * the element is mounted as a route so route params are available.
 */
export function renderWithRouter(ui: ReactElement, options: RenderWithRouterOptions = {}) {
  const { route = "/", path, user } = options;
  return render(
    <QueryClientProvider client={makeClient()}>
      <AuthContext.Provider value={authValue(user)}>
        <MemoryRouter initialEntries={[route]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          {path ? (
            <Routes>
              <Route path={path} element={ui} />
            </Routes>
          ) : (
            ui
          )}
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

/** Wrapper for `renderHook` that provides a QueryClient and a router context. */
export function HookWrapper({
  children,
  user,
}: {
  children: ReactNode;
  user?: User | null;
}) {
  return (
    <QueryClientProvider client={makeClient()}>
      <AuthContext.Provider value={authValue(user)}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{children}</MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}
