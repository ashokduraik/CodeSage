import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { apiFetch } from "@/shared/lib/apiClient";
import type { NodeApi } from "@codesage/shared-types";

type User = NodeApi.components["schemas"]["User"];
type LoginResponse = NodeApi.components["schemas"]["LoginResponse"];

/** Token localStorage key — holds the raw JWT string. */
const TOKEN_KEY = "codesage_token";

/** Shape of the auth context value consumed by {@link useAuth}. */
export interface AuthContextValue {
  /** The authenticated user, or `null` when unauthenticated. */
  user: User | null;
  /** The raw JWT string, or `null` when unauthenticated. */
  token: string | null;
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
 * @param children - Child components.
 */
export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore session from localStorage on mount.
  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (!stored) {
      setIsLoading(false);
      return;
    }
    apiFetch<User>("/users/me", { token: stored })
      .then((u) => {
        setToken(stored);
        setUser(u);
      })
      .catch(() => {
        // Token is invalid or expired; clear it silently.
        localStorage.removeItem(TOKEN_KEY);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<void> => {
    const res = await apiFetch<LoginResponse>("/auth/login", {
      method: "POST",
      body: { email, password },
    });
    localStorage.setItem(TOKEN_KEY, res.token);
    setToken(res.token);
    setUser(res.user);
  }, []);

  const logout = useCallback((): void => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout }}>
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
