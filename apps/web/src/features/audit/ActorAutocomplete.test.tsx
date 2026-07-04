import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithRouter } from "@/test/utils";
import { ActorAutocomplete } from "./ActorAutocomplete";

vi.mock("./useUserSearch", () => ({ useUserSearch: vi.fn() }));
import { useUserSearch } from "./useUserSearch";

const mockSearch = vi.mocked(useUserSearch);

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
    await waitFor(() => {
      expect(screen.getByText("alice@example.com")).toBeTruthy();
    });
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
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith("u1", "alice@example.com");
    });
  });
});
