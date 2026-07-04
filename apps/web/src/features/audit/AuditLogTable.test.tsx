import { describe, it, expect, afterEach } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { renderWithRouter } from "@/test/utils";
import { AuditLogTable } from "./AuditLogTable";

afterEach(cleanup);

const ITEMS = [
  {
    id: "a1",
    actorId: "u1",
    actorEmail: "admin@example.com",
    action: "project.create" as const,
    target: "project-uuid",
    ts: "2026-07-04T10:00:00.000Z",
  },
  {
    id: "a2",
    actorId: null,
    actorEmail: null,
    action: "repo.detach" as const,
    target: null,
    ts: "2026-07-03T10:00:00.000Z",
  },
  {
    id: "a3",
    actorId: "u-deleted",
    actorEmail: null,
    action: "user.create" as const,
    target: "u-new",
    ts: "2026-07-02T10:00:00.000Z",
  },
];

describe("AuditLogTable", () => {
  it("renders audit rows with human-readable actions", () => {
    renderWithRouter(<AuditLogTable items={ITEMS} />);
    expect(screen.getAllByText("Project created").length).toBeGreaterThan(0);
    expect(screen.getAllByText("admin@example.com").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Unknown actor").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Deleted user").length).toBeGreaterThan(0);
  });
});
