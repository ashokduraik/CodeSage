import { describe, it, expect, afterEach } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { renderWithRouter } from "@/test/utils";
import { Sidebar } from "./Sidebar";

afterEach(cleanup);

describe("Sidebar", () => {
  it("renders the brand and navigation entries", () => {
    renderWithRouter(<Sidebar />, { route: "/" });
    expect(screen.getByText("CodeSage")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Chat" })).toBeTruthy();
  });

  it("marks the dashboard link active on the root route", () => {
    renderWithRouter(<Sidebar />, { route: "/" });
    expect(screen.getByRole("link", { name: "Dashboard" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Chat" }).getAttribute("aria-current")).toBeNull();
  });

  it("shows audit log nav for admin users", () => {
    renderWithRouter(<Sidebar />, {
      route: "/",
      user: {
        id: "u1",
        email: "admin@example.com",
        role: "admin",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    });
    expect(screen.getByRole("link", { name: "Audit log" })).toBeTruthy();
  });

  it("hides audit log nav for non-admin users", () => {
    renderWithRouter(<Sidebar />, {
      route: "/",
      user: {
        id: "u2",
        email: "dev@example.com",
        role: "developer",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    });
    expect(screen.queryByRole("link", { name: "Audit log" })).toBeNull();
  });
});
