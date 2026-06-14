import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { renderWithRouter } from "@/test/utils";
import { MobileNav } from "./MobileNav";

afterEach(cleanup);

describe("MobileNav", () => {
  it("renders navigation entries and marks the active route", () => {
    renderWithRouter(<MobileNav onClose={() => undefined} />, { route: "/chat" });
    expect(screen.getByRole("link", { name: "Chat" }).getAttribute("aria-current")).toBe("page");
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    renderWithRouter(<MobileNav onClose={onClose} />, { route: "/" });
    // Two controls share this label (overlay + explicit close button); click the last.
    const closers = screen.getAllByRole("button", { name: "Close navigation menu" });
    fireEvent.click(closers[closers.length - 1] as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the overlay is clicked", () => {
    const onClose = vi.fn();
    renderWithRouter(<MobileNav onClose={onClose} />, { route: "/" });
    const overlays = screen.getAllByRole("button", { name: "Close navigation menu" });
    fireEvent.click(overlays[0] as HTMLElement);
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose after navigating via a link", () => {
    const onClose = vi.fn();
    renderWithRouter(<MobileNav onClose={onClose} />, { route: "/" });
    fireEvent.click(screen.getByRole("link", { name: "Dashboard" }));
    expect(onClose).toHaveBeenCalled();
  });
});
