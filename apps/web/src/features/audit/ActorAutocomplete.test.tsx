import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithRouter } from "@/test/utils";
import { ActorAutocomplete } from "./ActorAutocomplete";

vi.mock("./useUserSearch", () => ({ useUserSearch: vi.fn() }));
import { useUserSearch } from "./useUserSearch";

const mockSearch = vi.mocked(useUserSearch);

beforeEach(() => {
  mockSearch.mockReset();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ActorAutocomplete", () => {
  it("opens suggestions after typing two characters", async () => {
    mockSearch.mockReturnValue({
      data: [{ id: "u1", email: "alice@example.com", isSystem: false }],
      isFetching: false,
    } as never);
    const onChange = vi.fn();
    renderWithRouter(
      <ActorAutocomplete value="" displayEmail="" onChange={onChange} />,
    );
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "al" } });
    expect(await screen.findByText("alice@example.com")).toBeTruthy();
  });

  it("selects option on Enter key", async () => {
    mockSearch.mockReturnValue({
      data: [{ id: "u1", email: "alice@example.com", isSystem: false }],
      isFetching: false,
    } as never);
    const onChange = vi.fn();
    renderWithRouter(
      <ActorAutocomplete value="" displayEmail="" onChange={onChange} />,
    );
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "al" } });
    await screen.findByText("alice@example.com");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith("u1", "alice@example.com");
    });
  });
});
