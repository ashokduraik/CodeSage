import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { renderWithRouter } from "@/test/utils";
import { AuditLogFilters } from "./AuditLogFilters";
import { defaultAuditLogUrlState } from "./useAuditLogUrlState";

afterEach(cleanup);

describe("AuditLogFilters", () => {
  it("invokes onApply when Search is clicked", () => {
    const onApply = vi.fn();
    const state = defaultAuditLogUrlState();
    renderWithRouter(
      <AuditLogFilters
        applied={state}
        onApply={onApply}
        onPresetApply={vi.fn()}
        onClearAll={vi.fn()}
        onRemoveChip={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(onApply).toHaveBeenCalled();
  });

  it("shows action chip when applied filter is set", () => {
    const state = { ...defaultAuditLogUrlState(), action: "project.create" };
    renderWithRouter(
      <AuditLogFilters
        applied={state}
        onApply={vi.fn()}
        onPresetApply={vi.fn()}
        onClearAll={vi.fn()}
        onRemoveChip={vi.fn()}
      />,
    );
    expect(screen.getByText(/Action: Project created/)).toBeTruthy();
  });

  it("calls onClearAll from clear button", () => {
    const onClearAll = vi.fn();
    const state = defaultAuditLogUrlState();
    renderWithRouter(
      <AuditLogFilters
        applied={state}
        onApply={vi.fn()}
        onPresetApply={vi.fn()}
        onClearAll={onClearAll}
        onRemoveChip={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(onClearAll).toHaveBeenCalled();
  });

  it("shows custom date inputs when preset is custom", () => {
    const state = { ...defaultAuditLogUrlState(), preset: "custom" as const };
    renderWithRouter(
      <AuditLogFilters
        applied={state}
        onApply={vi.fn()}
        onPresetApply={vi.fn()}
        onClearAll={vi.fn()}
        onRemoveChip={vi.fn()}
      />,
    );
    expect(screen.getByText("From")).toBeTruthy();
    expect(screen.getByText("To")).toBeTruthy();
  });

  it("calls onRemoveChip for actor chip", () => {
    const onRemoveChip = vi.fn();
    const state = {
      ...defaultAuditLogUrlState(),
      actorId: "u1",
      actorEmail: "alice@example.com",
    };
    renderWithRouter(
      <AuditLogFilters
        applied={state}
        onApply={vi.fn()}
        onPresetApply={vi.fn()}
        onClearAll={vi.fn()}
        onRemoveChip={onRemoveChip}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove actor filter" }));
    expect(onRemoveChip).toHaveBeenCalledWith("actor");
  });
});
