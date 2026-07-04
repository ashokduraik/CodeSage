import { describe, it, expect } from "vitest";
import { NAV_ITEMS, isNavItemActive } from "./navItems";

describe("navItems", () => {
  it("lists only routes that currently exist", () => {
    expect(NAV_ITEMS.map((item) => item.path)).toEqual([
      "/",
      "/projects",
      "/chat",
      "/admin/audit-log",
    ]);
  });

  it("marks audit log as admin-only", () => {
    const audit = NAV_ITEMS.find((item) => item.path === "/admin/audit-log");
    expect(audit?.adminOnly).toBe(true);
  });

  it("marks the root active only on an exact match", () => {
    expect(isNavItemActive("/", "/")).toBe(true);
    expect(isNavItemActive("/", "/chat")).toBe(false);
  });

  it("marks a non-root entry active for its path and sub-routes", () => {
    expect(isNavItemActive("/chat", "/chat")).toBe(true);
    expect(isNavItemActive("/chat", "/chat/s1")).toBe(true);
    expect(isNavItemActive("/chat", "/")).toBe(false);
  });
});
