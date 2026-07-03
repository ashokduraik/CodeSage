import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithRouter } from "@/test/utils";
import { resetChatStore } from "./chatStore";
import type { ChatSession } from "./chatTypes";
import { NewChatDialog } from "./NewChatDialog";

vi.mock("@/features/projects/projectsClient", () => ({
  fetchProjects: vi.fn().mockResolvedValue([
    {
      id: "p1",
      name: "acme/storefront",
      status: "indexed",
      repoCount: 3,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "p2",
      name: "acme/billing",
      status: "indexing",
      repoCount: 1,
      createdAt: "2026-01-02T00:00:00.000Z",
    },
  ]),
}));

beforeEach(() => resetChatStore());
afterEach(cleanup);

describe("NewChatDialog", () => {
  it("renders nothing when closed", () => {
    renderWithRouter(
      <NewChatDialog open={false} onOpenChange={() => undefined} onCreated={() => undefined} />,
    );
    expect(screen.queryByText("New Conversation")).toBeNull();
  });

  it("lists all projects from the API dynamically", async () => {
    renderWithRouter(
      <NewChatDialog open onOpenChange={() => undefined} onCreated={() => undefined} />,
    );
    expect(await screen.findByText("New Conversation")).toBeTruthy();
    expect(await screen.findByRole("option", { name: "acme/storefront" })).toBeTruthy();
    expect(await screen.findByRole("option", { name: "acme/billing (indexing)" })).toBeTruthy();
  });

  it("creates a session with placeholder title and chosen project", async () => {
    const onCreated = vi.fn();
    const onOpenChange = vi.fn();
    renderWithRouter(
      <NewChatDialog open onOpenChange={onOpenChange} onCreated={onCreated} />,
    );
    await screen.findByRole("option", { name: "acme/storefront" });

    fireEvent.change(screen.getByLabelText("Mode"), { target: { value: "end_user" } });
    fireEvent.change(screen.getByLabelText("Project"), { target: { value: "p1" } });
    fireEvent.click(screen.getByRole("button", { name: "Start Chat" }));

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    const session = onCreated.mock.calls[0]?.[0] as ChatSession;
    expect(session.title).toBe("New Chat");
    expect(session.mode).toBe("end_user");
    expect(session.projectName).toBe("acme/storefront");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("disables submit until a project is selected", async () => {
    renderWithRouter(
      <NewChatDialog open onOpenChange={() => undefined} onCreated={() => undefined} />,
    );
    await screen.findByText("New Conversation");
    expect(screen.getByRole("button", { name: "Start Chat" })).toHaveProperty("disabled", true);
  });

  it("closes when cancel is clicked", async () => {
    const onOpenChange = vi.fn();
    renderWithRouter(
      <NewChatDialog open onOpenChange={onOpenChange} onCreated={() => undefined} />,
    );
    await screen.findByText("New Conversation");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
