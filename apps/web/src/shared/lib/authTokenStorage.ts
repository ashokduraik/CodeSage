/** localStorage key for the session JWT — not exported to avoid scattered reads. */
const TOKEN_KEY = "codesage_token";

/** Reject implausible values before persisting (length cap mitigates abuse). */
const MAX_TOKEN_LENGTH = 8192;

/**
 * Reads the stored JWT from localStorage.
 * Returns `null` when absent or when storage is unavailable (e.g. private browsing).
 */
export function getAuthToken(): string | null {
  try {
    const value = localStorage.getItem(TOKEN_KEY);
    return value && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

/**
 * Returns whether a JWT is currently stored.
 */
export function hasAuthToken(): boolean {
  return getAuthToken() !== null;
}

/**
 * Persists a JWT in localStorage after basic validation.
 * Invalid or oversized tokens are ignored.
 *
 * @param token - Raw JWT string from the login response.
 */
export function setAuthToken(token: string): void {
  if (!token || token.length > MAX_TOKEN_LENGTH) {
    return;
  }
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Storage unavailable or quota exceeded — session will not persist.
  }
}

/**
 * Removes the stored JWT from localStorage.
 */
export function clearAuthToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage unavailable — nothing to clear.
  }
}
