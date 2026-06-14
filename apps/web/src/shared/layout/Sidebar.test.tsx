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

  it("marks the chat link active on a chat sub-route", () => {
    renderWithRouter(<Sidebar />, { route: "/chat/s1" });
    expect(screen.getByRole("link", { name: "Chat" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Dashboard" }).getAttribute("aria-current")).toBeNull();
  });
});
