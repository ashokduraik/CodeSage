import { describe, it, expect, vi, afterEach } from "vitest";
import { notifyUnauthorized, setUnauthorizedHandler } from "./unauthorizedHandler";

afterEach(() => {
  setUnauthorizedHandler(null);
});

describe("unauthorizedHandler", () => {
  it("does nothing when no handler is registered", () => {
    expect(() => notifyUnauthorized()).not.toThrow();
  });

  it("invokes the registered handler on notifyUnauthorized", () => {
    const fn = vi.fn();
    setUnauthorizedHandler(fn);
    notifyUnauthorized();
    expect(fn).toHaveBeenCalledOnce();
  });

  it("deduplicates concurrent notifyUnauthorized calls", () => {
    const fn = vi.fn();
    setUnauthorizedHandler(fn);
    notifyUnauthorized();
    notifyUnauthorized();
    notifyUnauthorized();
    expect(fn).toHaveBeenCalledOnce();
  });

  it("resets dedupe when a new handler is registered", () => {
    const first = vi.fn();
    const second = vi.fn();
    setUnauthorizedHandler(first);
    notifyUnauthorized();
    setUnauthorizedHandler(second);
    notifyUnauthorized();
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
  });

  it("clears the handler when set to null", () => {
    const fn = vi.fn();
    setUnauthorizedHandler(fn);
    setUnauthorizedHandler(null);
    notifyUnauthorized();
    expect(fn).not.toHaveBeenCalled();
  });
});
