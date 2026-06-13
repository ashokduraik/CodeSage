import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import "../i18n"; // initialise i18next before rendering
import { App } from "./App";

/**
 * Wraps `ui` in a fresh QueryClient so each test starts with a clean cache.
 * `retry: false` prevents React Query from retrying failed requests in tests.
 */
function renderWithProviders(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("App", () => {
  it("shows loading status while the health check is pending", () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => new Promise(() => undefined)));
    renderWithProviders(<App />);
    expect(screen.getByTestId("status").textContent).toBe("Checking API\u2026");
  });

  it("shows healthy status when the API responds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "ok", service: "api" }) }),
    );
    renderWithProviders(<App />);
    expect(await screen.findByText("API healthy: api")).toBeTruthy();
  });

  it("shows an error status when the API is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    renderWithProviders(<App />);
    expect(await screen.findByText("API unreachable")).toBeTruthy();
  });
});
