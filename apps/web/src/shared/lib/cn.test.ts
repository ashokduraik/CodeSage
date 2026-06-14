import { describe, it, expect } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("joins truthy class names and ignores falsy ones", () => {
    expect(cn("a", false, undefined, "b", null)).toBe("a b");
  });

  it("resolves conflicting Tailwind classes with the last one winning", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  it("supports conditional object and array syntax", () => {
    expect(cn(["a", { b: true, c: false }])).toBe("a b");
  });
});
