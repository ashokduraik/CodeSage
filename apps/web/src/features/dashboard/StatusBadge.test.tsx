import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@/i18n";
import { StatusBadge } from "./StatusBadge";

afterEach(cleanup);

describe("StatusBadge", () => {
  it("renders a localized label for a settled status without a pulse dot", () => {
    const { container } = render(<StatusBadge status="indexed" />);
    expect(screen.getByText("Indexed")).toBeTruthy();
    expect(container.querySelector(".animate-pulse")).toBeNull();
  });

  it("shows a pulsing dot for in-progress statuses", () => {
    const { container } = render(<StatusBadge status="indexing" />);
    expect(screen.getByText("Indexing")).toBeTruthy();
    expect(container.querySelector(".animate-pulse")).toBeTruthy();
  });
});
