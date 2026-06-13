import { describe, it, expect } from "vitest";
import i18n from "./index";

describe("i18n", () => {
  it("is initialised", () => {
    expect(i18n.isInitialized).toBe(true);
  });

  it("resolves the English app title", () => {
    expect(i18n.t("app.title")).toBe("CodeSage");
  });

  it("resolves the status.checking string", () => {
    expect(i18n.t("status.checking")).toBe("Checking API\u2026");
  });

  it("resolves status.healthy with service interpolation", () => {
    expect(i18n.t("status.healthy", { service: "api" })).toBe("API healthy: api");
  });

  it("resolves the status.unreachable string", () => {
    expect(i18n.t("status.unreachable")).toBe("API unreachable");
  });
});
