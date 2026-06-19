import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { apiFetch } from "@/shared/lib/apiClient";
import {
  clearAuthToken,
  getAuthToken,
  setAuthToken,
} from "@/shared/lib/authTokenStorage";
import type { NodeApi } from "@codesage/shared-types";

type User = NodeApi.components["schemas"]["User"];
type LoginResponse = NodeApi.components["schemas"]["LoginResponse"];

/** Shape of the auth context value consumed by {@link useAuth}. */
export interface AuthContextValue {
  /** The authenticated user, or `null` when unauthenticated. */
  user: User | null;
  /** Whether the initial session restore from localStorage is still in progress. */
  isLoading: boolean;
  /**
   * Authenticates with email + password. Stores the token in localStorage.
   * @throws {@link ApiClientError} on invalid credentials or network failure.
   */
  login: (email: string, password: string) => Promise<void>;
  /** Clears the stored token and user; redirects to /login. */
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Provides authentication state to the component tree.
 * On mount, restores an existing JWT from localStorage and verifies it via `GET /users/me`.
 * The JWT itself is not held in React state — only in localStorage via {@link setAuthToken}.
 * @param children - Child components.
 */
export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore session from localStorage on mount.
  useEffect(() => {
    const stored = getAuthToken();
    if (!stored) {
      setIsLoading(false);
      return;
    }
    apiFetch<User>("/users/me")
      .then((u) => {
        setUser(u);
      })
      .catch(() => {
        clearAuthToken();
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<void> => {
    const res = await apiFetch<LoginResponse>("/auth/login", {
      method: "POST",
      body: { email, password },
      skipAuth: true,
    });
    setAuthToken(res.token);
    setUser(res.user);
  }, []);

  const logout = useCallback((): void => {
    clearAuthToken();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Returns the auth context value. Must be called within an {@link AuthProvider}.
 * @throws If called outside of an AuthProvider.
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider.");
  }
  return ctx;
}
