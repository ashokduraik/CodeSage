import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@/i18n";
import { NewChatDialog } from "./NewChatDialog";

// Isolated from NewChatDialog.test.tsx: the in-flight ("Creating…") state is not
// observable with the instantly-resolving mock, so both hooks are stubbed here.
vi.mock("./useProjects", () => ({ useProjects: () => ({ data: [] }) }));
vi.mock("./useCreateSession", () => ({
  useCreateSession: () => ({ mutate: vi.fn(), isPending: true }),
}));

afterEach(cleanup);

describe("NewChatDialog (pending)", () => {
  it("shows the creating label and disables submit while in flight", () => {
    render(<NewChatDialog open onOpenChange={() => undefined} onCreated={() => undefined} />);
    const submit = screen.getByRole("button", { name: "Creating\u2026" });
    expect(submit).toBeTruthy();
    expect((submit as HTMLButtonElement).disabled).toBe(true);
  });
});
