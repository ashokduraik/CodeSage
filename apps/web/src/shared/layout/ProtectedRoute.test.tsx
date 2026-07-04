import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import "@/i18n";
import { AuthContext, type AuthContextValue } from "@/features/auth";
import { ProtectedRoute } from "./ProtectedRoute";

afterEach(cleanup);

const MOCK_USER = {
  id: "u1",
  email: "test@example.com",
  role: "developer" as const,
  createdAt: "2026-01-01T00:00:00.000Z",
};

function renderWithAuth(auth: Partial<AuthContextValue>, initialPath = "/protected") {
  const value: AuthContextValue = {
    user: null,
    isLoading: false,
    sessionExpired: false,
    login: vi.fn(),
    logout: vi.fn(),
    ...auth,
  };
  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={[initialPath]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/protected" element={<div>Protected Content</div>} />
          </Route>
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("ProtectedRoute", () => {
  it("renders a spinner while the session restore is loading", () => {
    renderWithAuth({ isLoading: true });
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("redirects to /login when the user is not authenticated", () => {
    renderWithAuth({ user: null, isLoading: false });
    expect(screen.getByText("Login Page")).toBeTruthy();
  });

  it("renders the protected content when the user is authenticated", () => {
    renderWithAuth({ user: MOCK_USER, isLoading: false });
    expect(screen.getByText("Protected Content")).toBeTruthy();
  });
});
