import { describe, it, expect, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import "@/i18n";
import { AppLayout } from "./AppLayout";

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={["/"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<div>child content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe("AppLayout", () => {
  it("renders the routed child via the outlet", () => {
    renderLayout();
    expect(screen.getByText("child content")).toBeTruthy();
  });

  it("opens and closes the mobile navigation drawer", () => {
    renderLayout();
    expect(screen.queryByRole("button", { name: "Close navigation menu" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Open navigation menu" }));
    expect(screen.getAllByRole("button", { name: "Close navigation menu" }).length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("button", { name: "Close navigation menu" })[0] as HTMLElement);
    expect(screen.queryByRole("button", { name: "Close navigation menu" })).toBeNull();
  });
});
