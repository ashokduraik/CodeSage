import type { ReactElement, ReactNode } from "react";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import "../i18n"; // ensure i18next is initialised before any component renders

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
}

/**
 * Renders `ui` wrapped in a QueryClient and MemoryRouter. When `path` is given,
 * the element is mounted as a route so route params are available.
 */
export function renderWithRouter(ui: ReactElement, options: RenderWithRouterOptions = {}) {
  const { route = "/", path } = options;
  return render(
    <QueryClientProvider client={makeClient()}>
      <MemoryRouter initialEntries={[route]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        {path ? (
          <Routes>
            <Route path={path} element={ui} />
          </Routes>
        ) : (
          ui
        )}
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Wrapper for `renderHook` that provides a QueryClient and a router context. */
export function HookWrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={makeClient()}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}
