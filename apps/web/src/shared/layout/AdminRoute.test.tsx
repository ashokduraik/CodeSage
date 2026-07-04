import { describe, it, expect, afterEach } from "vitest";
import { cleanup, screen, render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { renderWithRouter, makeClient } from "@/test/utils";
import { AuthContext, type AuthContextValue } from "@/features/auth/AuthContext";
import { AdminRoute } from "./AdminRoute";

afterEach(cleanup);

function renderAdminRoute(user: AuthContextValue["user"]) {
  return renderWithRouter(
    <Routes>
      <Route element={<AdminRoute />}>
        <Route path="/admin/audit-log" element={<div>Audit content</div>} />
      </Route>
    </Routes>,
    {
      route: "/admin/audit-log",
      user,
    },
  );
}

describe("AdminRoute", () => {
  it("shows spinner while auth is loading", () => {
    const value: AuthContextValue = {
      user: null,
      isLoading: true,
      sessionExpired: false,
      login: async () => {},
      logout: () => {},
    };
    render(
      <QueryClientProvider client={makeClient()}>
        <AuthContext.Provider value={value}>
          <MemoryRouter initialEntries={["/admin/audit-log"]}>
            <Routes>
              <Route element={<AdminRoute />}>
                <Route path="/admin/audit-log" element={<div>Audit content</div>} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthContext.Provider>
      </QueryClientProvider>,
    );
    expect(screen.queryByText("Audit content")).toBeNull();
  });

  it("renders child route for admin users", () => {
    renderAdminRoute({
      id: "u1",
      email: "admin@example.com",
      role: "admin",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(screen.getByText("Audit content")).toBeTruthy();
  });

  it("shows access denied for non-admin users", () => {
    renderAdminRoute({
      id: "u2",
      email: "dev@example.com",
      role: "developer",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(screen.getByText("Access denied")).toBeTruthy();
    expect(screen.queryByText("Audit content")).toBeNull();
  });
});
