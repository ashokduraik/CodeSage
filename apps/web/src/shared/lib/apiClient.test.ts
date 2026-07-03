import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { apiFetch, ApiClientError } from "./apiClient";
import { clearAuthToken, setAuthToken } from "./authTokenStorage";

function mockFetch(status: number, body: unknown, ok?: boolean): void {
  const isOk = ok ?? (status >= 200 && status < 300);
  global.fetch = vi.fn().mockResolvedValue({
    ok: isOk,
    status,
    statusText: "Test Status",
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response);
}

afterEach(() => {
  vi.restoreAllMocks();
  clearAuthToken();
});

beforeEach(() => {
  clearAuthToken();
});

describe("apiFetch", () => {
  it("returns parsed JSON for a successful response", async () => {
    mockFetch(200, { id: "p1", name: "Acme" });
    const result = await apiFetch<{ id: string; name: string }>("/projects");
    expect(result).toEqual({ id: "p1", name: "Acme" });
  });

  it("omits Content-Type on bodyless GET requests", async () => {
    mockFetch(200, {});
    await apiFetch("/health");
    const callArg = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[1];
    expect(callArg?.headers).not.toHaveProperty("Content-Type");
  });

  it("sets Content-Type when a JSON body is sent", async () => {
    mockFetch(201, { id: "p1" });
    await apiFetch("/projects", { method: "POST", body: { name: "Acme" } });
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/projects",
      expect.objectContaining({
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
      }),
    );
  });

  it("attaches Authorization header when token is provided explicitly", async () => {
    mockFetch(200, {});
    await apiFetch("/projects", { token: "my-jwt" });
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/projects",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer my-jwt" }),
      }),
    );
  });

  it("attaches Authorization header from stored token by default", async () => {
    mockFetch(200, {});
    setAuthToken("stored-jwt");
    await apiFetch("/projects");
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/projects",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer stored-jwt" }),
      }),
    );
  });

  it("does not attach Authorization when skipAuth is true", async () => {
    mockFetch(200, {});
    setAuthToken("stored-jwt");
    await apiFetch("/auth/login", { method: "POST", body: { email: "a", password: "b" }, skipAuth: true });
    const callArg = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[1];
    expect(callArg?.headers).not.toHaveProperty("Authorization");
  });

  it("serialises the body to JSON", async () => {
    mockFetch(201, { id: "p1" });
    await apiFetch("/projects", { method: "POST", body: { name: "Acme" } });
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/projects",
      expect.objectContaining({ body: JSON.stringify({ name: "Acme" }) }),
    );
  });

  it("returns undefined for 204 No Content", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      json: vi.fn(),
    } as unknown as Response);
    const result = await apiFetch("/projects/p1");
    expect(result).toBeUndefined();
  });

  it("throws ApiClientError with parsed code and message on non-2xx", async () => {
    mockFetch(404, { error: { code: "NOT_FOUND", message: "Project not found." } }, false);
    await expect(apiFetch("/projects/missing")).rejects.toBeInstanceOf(ApiClientError);
    await expect(apiFetch("/projects/missing")).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
      message: "Project not found.",
    });
  });

  it("falls back to statusText when error body is not JSON", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: vi.fn().mockRejectedValue(new SyntaxError("bad json")),
    } as unknown as Response);
    const err = (await apiFetch("/fail").catch((e: unknown) => e)) as ApiClientError;
    expect(err).toBeInstanceOf(ApiClientError);
    expect(err.status).toBe(500);
    expect(err.code).toBe("REQUEST_ERROR");
  });

  it("does not set body when body option is absent", async () => {
    mockFetch(200, {});
    await apiFetch("/health");
    const callArg = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[1];
    expect(callArg?.body).toBeUndefined();
  });

  it("falls back to REQUEST_ERROR code and statusText when error body has no code or message", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      json: vi.fn().mockResolvedValue({ error: {} }),
    } as unknown as Response);
    const err = (await apiFetch("/bad").catch((e: unknown) => e)) as ApiClientError;
    expect(err).toBeInstanceOf(ApiClientError);
    expect(err.code).toBe("REQUEST_ERROR");
    expect(err.message).toBe("Bad Request");
  });
});

describe("ApiClientError", () => {
  it("sets name, status, code, and message", () => {
    const err = new ApiClientError(401, "UNAUTHORIZED", "Token expired.");
    expect(err.name).toBe("ApiClientError");
    expect(err.status).toBe(401);
    expect(err.code).toBe("UNAUTHORIZED");
    expect(err.message).toBe("Token expired.");
    expect(err).toBeInstanceOf(Error);
  });
});
