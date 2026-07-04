import { describe, it, expect, afterEach } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { renderWithRouter } from "@/test/utils";
import { AppLayout } from "./AppLayout";

function renderLayout() {
  return renderWithRouter(
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<div>child content</div>} />
      </Route>
    </Routes>,
    { route: "/" },
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
