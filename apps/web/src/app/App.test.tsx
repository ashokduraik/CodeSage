import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "../i18n"; // initialise i18next before rendering
import { resetMockStore } from "@/shared/mock";
import type { AuthContextValue } from "@/features/auth";

/**
 * Mock useDashboardData so the Dashboard renders its loaded state without
 * making real API calls. The integration test only cares about routing/layout.
 */
vi.mock("@/features/dashboard/useDashboardData", () => ({
  useDashboardData: vi.fn(() => ({
    isPending: false,
    isError: false,
    data: {
      projects: [],
      sessions: [],
      stats: {
        projectCount: 0,
        indexedProjectCount: 0,
        sessionCount: 0,
        knowledgeCount: 0,
        pendingReviewCount: 0,
      },
    },
  })),
}));

/** Mock the entire auth module so routing tests are not coupled to real auth logic. */
vi.mock("@/features/auth", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createContext, useContext } = require("react") as typeof import("react");
  const AuthContext = createContext<AuthContextValue | null>(null);
  const useAuth = () => {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used within an AuthProvider.");
    return ctx;
  };
  const AuthProvider = ({ children }: { children: import("react").ReactNode }) => children;
  const LoginPage = () => <div>Login</div>;
  return { AuthContext, useAuth, AuthProvider, LoginPage };
});

const AUTHENTICATED_CTX: AuthContextValue = {
  user: { id: "u1", email: "test@example.com", role: "developer", createdAt: "2026-01-01T00:00:00.000Z" },
  isLoading: false,
  login: vi.fn(),
  logout: vi.fn(),
};

const UNAUTHENTICATED_CTX: AuthContextValue = {
  user: null,
  isLoading: false,
  login: vi.fn(),
  logout: vi.fn(),
};

const LOADING_CTX: AuthContextValue = {
  user: null,
  isLoading: true,
  login: vi.fn(),
  logout: vi.fn(),
};

import { AuthContext } from "@/features/auth";
import { App } from "./App";

function renderApp(path: string, authCtx: AuthContextValue = AUTHENTICATED_CTX) {
  window.history.pushState({}, "", path);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={authCtx}>
        <App />
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

beforeEach(() => resetMockStore());
afterEach(cleanup);

describe("App", () => {
  it("renders the dashboard inside the app layout at the root route (authenticated)", async () => {
    renderApp("/");
    expect(screen.getAllByText("CodeSage").length).toBeGreaterThan(0);
    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeTruthy();
  });

  it("redirects unknown routes to the dashboard (authenticated)", async () => {
    renderApp("/does-not-exist");
    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeTruthy();
  });

  it("shows a spinner while loading the session", () => {
    renderApp("/", LOADING_CTX);
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("redirects to /login when unauthenticated", () => {
    renderApp("/", UNAUTHENTICATED_CTX);
    expect(screen.getByText("Login")).toBeTruthy();
  });
});
