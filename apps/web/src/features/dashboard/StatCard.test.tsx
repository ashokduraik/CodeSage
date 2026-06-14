import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { GitBranch } from "lucide-react";
import { StatCard } from "./StatCard";

afterEach(cleanup);

describe("StatCard", () => {
  it("renders the label, value and sub-label", () => {
    render(<StatCard icon={GitBranch} label="Projects" value={4} sublabel="2 indexed" />);
    expect(screen.getByText("Projects")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.getByText("2 indexed")).toBeTruthy();
  });

  it("omits the sub-label when not provided and accepts a color", () => {
    const { container } = render(
      <StatCard icon={GitBranch} label="Sessions" value={0} color="blue" />,
    );
    expect(screen.getByText("Sessions")).toBeTruthy();
    expect(container.querySelector(".text-blue-600")).toBeTruthy();
  });
});
