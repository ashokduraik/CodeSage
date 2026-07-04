import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { apiFetch, ApiClientError } from "@/shared/lib/apiClient";
import {
  clearAuthToken,
  getAuthToken,
  setAuthToken,
} from "@/shared/lib/authTokenStorage";
import { setUnauthorizedHandler } from "@/shared/lib/unauthorizedHandler";
import type { NodeApi } from "@codesage/shared-types";

type User = NodeApi.components["schemas"]["User"];
type LoginResponse = NodeApi.components["schemas"]["LoginResponse"];

/** Shape of the auth context value consumed by {@link useAuth}. */
export interface AuthContextValue {
  /** The authenticated user, or `null` when unauthenticated. */
  user: User | null;
  /** Whether the initial session restore from localStorage is still in progress. */
  isLoading: boolean;
  /** True when the user was redirected to login because their JWT expired. */
  sessionExpired: boolean;
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
  const [isLoading, setIsLoading] = useState(() => getAuthToken() !== null);
  const [sessionExpired, setSessionExpired] = useState(false);

  const invalidateSession = useCallback((): void => {
    clearAuthToken();
    setUser(null);
    setSessionExpired(true);
  }, []);

  // Register global 401 handler before session restore runs.
  useEffect(() => {
    setUnauthorizedHandler(invalidateSession);
    return () => setUnauthorizedHandler(null);
  }, [invalidateSession]);

  // Restore session from localStorage on mount when a token is present.
  useEffect(() => {
    const stored = getAuthToken();
    if (!stored) {
      return;
    }
    apiFetch<User>("/users/me")
      .then((u) => {
        setUser(u);
      })
      .catch((err: unknown) => {
        if (err instanceof ApiClientError && err.status === 401) {
          invalidateSession();
        } else {
          clearAuthToken();
        }
      })
      .finally(() => setIsLoading(false));
  }, [invalidateSession]);

  const login = useCallback(async (email: string, password: string): Promise<void> => {
    const res = await apiFetch<LoginResponse>("/auth/login", {
      method: "POST",
      body: { email, password },
      skipAuth: true,
    });
    setAuthToken(res.token);
    setUser(res.user);
    setSessionExpired(false);
  }, []);

  const logout = useCallback((): void => {
    clearAuthToken();
    setUser(null);
    setSessionExpired(false);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, sessionExpired, login, logout }}>
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
