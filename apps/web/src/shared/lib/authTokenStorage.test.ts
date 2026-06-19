import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getAuthToken,
  setAuthToken,
  clearAuthToken,
  hasAuthToken,
} from "./authTokenStorage";

beforeEach(() => {
  localStorage.clear();
});

describe("authTokenStorage", () => {
  it("returns null when no token is stored", () => {
    expect(getAuthToken()).toBeNull();
    expect(hasAuthToken()).toBe(false);
  });

  it("stores and reads a token", () => {
    setAuthToken("my-jwt");
    expect(getAuthToken()).toBe("my-jwt");
    expect(hasAuthToken()).toBe(true);
  });

  it("ignores empty tokens", () => {
    setAuthToken("");
    expect(getAuthToken()).toBeNull();
  });

  it("clears a stored token", () => {
    setAuthToken("my-jwt");
    clearAuthToken();
    expect(getAuthToken()).toBeNull();
  });

  it("returns null when localStorage throws", () => {
    const getItem = Storage.prototype.getItem;
    Storage.prototype.getItem = vi.fn(() => {
      throw new Error("denied");
    });
    expect(getAuthToken()).toBeNull();
    Storage.prototype.getItem = getItem;
  });

  it("ignores set failures when localStorage throws", () => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = vi.fn(() => {
      throw new Error("denied");
    });
    setAuthToken("my-jwt");
    Storage.prototype.setItem = setItem;
    expect(getAuthToken()).toBeNull();
  });
});
