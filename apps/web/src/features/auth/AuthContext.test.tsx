import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen, act, waitFor, fireEvent } from "@testing-library/react";
import "@/i18n";
import { AuthProvider, useAuth } from "./AuthContext";
import { ApiClientError } from "@/shared/lib/apiClient";

vi.mock("@/shared/lib/apiClient", () => ({
  apiFetch: vi.fn(),
  ApiClientError: class ApiClientError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
      super(message);
      this.name = "ApiClientError";
      this.status = status;
      this.code = code;
    }
  },
}));

import { apiFetch } from "@/shared/lib/apiClient";
const mockFetch = vi.mocked(apiFetch);

const MOCK_USER = {
  id: "u1",
  email: "user@example.com",
  role: "developer" as const,
  createdAt: "2026-01-01T00:00:00.000Z",
};

/** Minimal consumer that exposes context state via DOM. */
function TestConsumer() {
  const { user, token, isLoading, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="user">{user?.email ?? "null"}</span>
      <span data-testid="token">{token ?? "null"}</span>
      <button onClick={() => void login("u@test.com", "pass123")}>login</button>
      <button onClick={logout}>logout</button>
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

afterEach(cleanup);

describe("AuthProvider — unauthenticated start", () => {
  it("resolves to unauthenticated when no token is stored", async () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    expect(screen.getByTestId("user").textContent).toBe("null");
    expect(screen.getByTestId("token").textContent).toBe("null");
  });
});

describe("AuthProvider — session restore", () => {
  it("restores session from localStorage when token is valid", async () => {
    localStorage.setItem("codesage_token", "stored-jwt");
    mockFetch.mockResolvedValueOnce(MOCK_USER);
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("user").textContent).toBe("user@example.com"),
    );
    expect(screen.getByTestId("token").textContent).toBe("stored-jwt");
  });

  it("clears the stored token when the session restore call fails (expired token)", async () => {
    localStorage.setItem("codesage_token", "expired-jwt");
    mockFetch.mockRejectedValueOnce(new ApiClientError(401, "UNAUTHORIZED", "Token expired."));
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    expect(localStorage.getItem("codesage_token")).toBeNull();
    expect(screen.getByTestId("user").textContent).toBe("null");
  });
});

describe("AuthProvider — login", () => {
  it("sets the token and user in state and localStorage after a successful login", async () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    mockFetch.mockResolvedValueOnce({ token: "new-jwt", user: MOCK_USER });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "login" }));
    });
    await waitFor(() =>
      expect(screen.getByTestId("user").textContent).toBe("user@example.com"),
    );
    expect(localStorage.getItem("codesage_token")).toBe("new-jwt");
    expect(screen.getByTestId("token").textContent).toBe("new-jwt");
  });
});

describe("AuthProvider — logout", () => {
  it("clears the token and user from state and localStorage", async () => {
    localStorage.setItem("codesage_token", "some-jwt");
    mockFetch.mockResolvedValueOnce(MOCK_USER);
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("user").textContent).toBe("user@example.com"));
    fireEvent.click(screen.getByRole("button", { name: "logout" }));
    expect(screen.getByTestId("user").textContent).toBe("null");
    expect(screen.getByTestId("token").textContent).toBe("null");
    expect(localStorage.getItem("codesage_token")).toBeNull();
  });
});

describe("useAuth", () => {
  it("throws when called outside of AuthProvider", () => {
    const BadConsumer = () => {
      useAuth();
      return null;
    };
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<BadConsumer />)).toThrow("useAuth must be used within an AuthProvider");
    consoleSpy.mockRestore();
  });
});
