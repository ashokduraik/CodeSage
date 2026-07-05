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
  it("renders the routed child via the outlet", async () => {
    renderLayout();
    expect(await screen.findByText("child content")).toBeTruthy();
  });

  it("opens and closes the mobile navigation drawer", async () => {
    renderLayout();
    expect(screen.queryByRole("button", { name: "Close navigation menu" })).toBeNull();

    fireEvent.click(await screen.findByRole("button", { name: "Open navigation menu" }));
    expect((await screen.findAllByRole("button", { name: "Close navigation menu" })).length).toBeGreaterThan(0);

    fireEvent.click(
      (await screen.findAllByRole("button", { name: "Close navigation menu" }))[0] as HTMLElement,
    );
    expect(screen.queryByRole("button", { name: "Close navigation menu" })).toBeNull();
  });
});
