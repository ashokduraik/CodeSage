/**
 * Thin typed fetch wrapper for the CodeSage Node API.
 *
 * All requests are routed through `/api` (proxied to the Node API in dev by Vite,
 * and served from the same origin in production).
 *
 * Security note: the JWT is attached via the Authorization header (Bearer scheme).
 * In production, consider migrating to HttpOnly cookies to mitigate XSS exposure.
 */

/* istanbul ignore next -- fallback only reachable when VITE_API_BASE_URL is unset (runtime safety net; test env always provides the value) */
const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api";

/** Standard error response shape returned by the Node API for all failures. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Error thrown when the API returns a non-2xx status.
 * Carries the HTTP status code and the parsed `ApiErrorBody` for structured handling.
 */
export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;

  /**
   * @param status - HTTP status code (e.g. 401, 404).
   * @param code - Machine-readable error code from the API response.
   * @param message - Human-readable error message.
   */
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
  }
}

/** Options passed to {@link apiFetch}. */
export interface ApiFetchOptions extends Omit<RequestInit, "body"> {
  /** JWT token for the Authorization header. When absent, the request is unauthenticated. */
  token?: string;
  /** Request body, serialised to JSON automatically. */
  body?: unknown;
}

/**
 * Sends a typed fetch request to the Node API.
 *
 * - Automatically sets `Content-Type: application/json`.
 * - Attaches `Authorization: Bearer <token>` when a token is provided.
 * - Throws {@link ApiClientError} for any non-2xx response.
 *
 * @param path - API path relative to `/api` (e.g. `/projects`).
 * @param options - Fetch options extended with `token` and typed `body`.
 * @returns Parsed JSON response body typed as `T`.
 * @throws {@link ApiClientError} on non-2xx responses.
 */
export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { token, body, headers: extraHeaders, ...rest } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(extraHeaders as Record<string, string>),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...rest,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let code = "REQUEST_ERROR";
    let message = response.statusText;
    try {
      const errBody = (await response.json()) as ApiErrorBody;
      code = errBody.error?.code ?? code;
      message = errBody.error?.message ?? message;
    } catch {
      // Response body was not valid JSON; use defaults above.
    }
    throw new ApiClientError(response.status, code, message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
