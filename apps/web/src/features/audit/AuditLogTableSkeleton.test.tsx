import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { AuditLogTableSkeleton } from "./AuditLogTableSkeleton";

describe("AuditLogTableSkeleton", () => {
  it("renders placeholder rows", () => {
    const { container } = render(<AuditLogTableSkeleton />);
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });
});
