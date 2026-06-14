import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithRouter } from "@/test/utils";
import { resetMockStore, type ChatSession } from "@/shared/mock";
import { NewChatDialog } from "./NewChatDialog";

beforeEach(() => resetMockStore());
afterEach(cleanup);

describe("NewChatDialog", () => {
  it("renders nothing when closed", () => {
    renderWithRouter(
      <NewChatDialog open={false} onOpenChange={() => undefined} onCreated={() => undefined} />,
    );
    expect(screen.queryByText("New Conversation")).toBeNull();
  });

  it("lists only indexed projects as options", async () => {
    renderWithRouter(
      <NewChatDialog open onOpenChange={() => undefined} onCreated={() => undefined} />,
    );
    expect(await screen.findByText("New Conversation")).toBeTruthy();
    expect(await screen.findByRole("option", { name: "acme/storefront" })).toBeTruthy();
  });

  it("creates a session with the entered title and chosen project", async () => {
    const onCreated = vi.fn();
    const onOpenChange = vi.fn();
    renderWithRouter(
      <NewChatDialog open onOpenChange={onOpenChange} onCreated={onCreated} />,
    );
    await screen.findByRole("option", { name: "acme/storefront" });

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Login bug" } });
    fireEvent.change(screen.getByLabelText("Mode"), { target: { value: "end_user" } });
    fireEvent.change(screen.getByLabelText("Project (optional)"), { target: { value: "p1" } });
    fireEvent.click(screen.getByRole("button", { name: "Start Chat" }));

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    const session = onCreated.mock.calls[0]?.[0] as ChatSession;
    expect(session.title).toBe("Login bug");
    expect(session.mode).toBe("end_user");
    expect(session.projectName).toBe("acme/storefront");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("falls back to the default title when none is entered", async () => {
    const onCreated = vi.fn();
    renderWithRouter(
      <NewChatDialog open onOpenChange={() => undefined} onCreated={onCreated} />,
    );
    await screen.findByRole("option", { name: "acme/storefront" });
    fireEvent.click(screen.getByRole("button", { name: "Start Chat" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect((onCreated.mock.calls[0]?.[0] as ChatSession).title).toBe("New Chat");
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
