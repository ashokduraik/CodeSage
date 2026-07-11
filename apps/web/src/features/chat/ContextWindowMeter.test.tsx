import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@/i18n";
import { ContextWindowMeter } from "./ContextWindowMeter";

afterEach(cleanup);

describe("ContextWindowMeter", () => {
  it("renders used and max context labels", () => {
    render(<ContextWindowMeter usedTokens={2100} maxTokens={32768} />);
    expect(screen.getByText("Context")).toBeTruthy();
    expect(screen.getByText(/2\.1K \/ 32\.8K/)).toBeTruthy();
  });

  it("exposes an accessible label for screen readers", () => {
    render(<ContextWindowMeter usedTokens={1000} maxTokens={8000} />);
    expect(screen.getByLabelText(/Context window/)).toBeTruthy();
  });
});
