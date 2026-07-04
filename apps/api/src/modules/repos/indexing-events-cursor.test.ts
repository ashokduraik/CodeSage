import { describe, it, expect } from "vitest";
import {
  encodeIndexingEventsCursor,
  decodeIndexingEventsCursor,
} from "./indexing-events-cursor";
import { ApiError } from "../../platform/errors";

describe("indexing-events-cursor", () => {
  it("round-trips startedAt and id", () => {
    const payload = {
      startedAt: "2026-07-04T14:36:00.000Z",
      id: "550e8400-e29b-41d4-a716-446655440000",
    };
    const token = encodeIndexingEventsCursor(payload);
    expect(decodeIndexingEventsCursor(token)).toEqual(payload);
  });

  it("throws ApiError 400 for invalid cursor", () => {
    expect(() => decodeIndexingEventsCursor("not-valid")).toThrow(ApiError);
    try {
      decodeIndexingEventsCursor("not-valid");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).statusCode).toBe(400);
    }
  });
});
