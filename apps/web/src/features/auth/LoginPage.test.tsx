import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "@/i18n";
import { LoginPage } from "./LoginPage";
import { AuthContext, type AuthContextValue } from "./AuthContext";

/** Mocked navigate spy — must live outside the mock so it can be asserted against. */
const navigateMock = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-router-dom")>();
  return { ...original, useNavigate: () => navigateMock };
});

const loginMock = vi.fn();

function renderLoginPage(authOverride: Partial<AuthContextValue> = {}): ReturnType<typeof render> {
  const value: AuthContextValue = {
    user: null,
    isLoading: false,
    login: loginMock,
    logout: vi.fn(),
    ...authOverride,
  };
  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <LoginPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe("LoginPage", () => {
  it("renders the email and password inputs", () => {
    renderLoginPage();
    expect(screen.getByLabelText(/email/i)).toBeTruthy();
    expect(screen.getByLabelText(/password/i)).toBeTruthy();
  });

  it("renders the submit button", () => {
    renderLoginPage();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeTruthy();
  });

  it("calls login with the entered credentials on form submit", async () => {
    loginMock.mockResolvedValue(undefined);
    renderLoginPage();
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "user@test.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "password123" } });
    fireEvent.submit(screen.getByRole("button", { name: /sign in/i }).closest("form")!);
    expect(loginMock).toHaveBeenCalledWith("user@test.com", "password123");
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/"));
  });

  it("navigates to / on successful login", async () => {
    loginMock.mockResolvedValue(undefined);
    renderLoginPage();
    fireEvent.submit(screen.getByRole("button").closest("form")!);
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/"));
  });

  it("shows an error message when login fails", async () => {
    loginMock.mockRejectedValue(new Error("Invalid credentials"));
    renderLoginPage();
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "bad@test.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "wrong" } });
    fireEvent.submit(screen.getByRole("button").closest("form")!);
    await waitFor(() =>
      expect(screen.getByRole("alert")).toBeTruthy(),
    );
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("disables the submit button while submitting", async () => {
    loginMock.mockImplementation(() => new Promise(() => {})); // never resolves
    renderLoginPage();
    fireEvent.submit(screen.getByRole("button").closest("form")!);
    await waitFor(() =>
      expect(screen.getByRole("button")).toHaveProperty("disabled", true),
    );
  });
});
