import { describe, it, expect, vi, afterEach } from "vitest";
import { getHealth } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getHealth", () => {
  it("returns parsed health on success (default baseUrl)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "ok", service: "api" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getHealth();
    expect(result).toEqual({ status: "ok", service: "api" });
    expect(fetchMock).toHaveBeenCalledWith("/api/health");
  });

  it("uses a custom baseUrl", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "ok", service: "api" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await getHealth("http://example.test");
    expect(fetchMock).toHaveBeenCalledWith("http://example.test/health");
  });

  it("throws when the response is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(getHealth()).rejects.toThrow("health check failed: 500");
  });
});
