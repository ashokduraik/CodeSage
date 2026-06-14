import { describe, it, expect, vi } from "vitest";
import { findUserById, emailExists, createUser } from "./users.repository";
import type { Sql } from "../../platform/db";

function makeMockSql(rows: unknown[]): Sql {
  return Object.assign(vi.fn().mockResolvedValue(rows), {
    end: vi.fn(),
    json: (v: unknown) => v,
  }) as unknown as Sql;
}

describe("findUserById", () => {
  it("returns the user row when found", async () => {
    const row = { id: "u1", email: "a@b.com", role: "developer", created_at: new Date() };
    const db = makeMockSql([row]);
    const result = await findUserById(db, "u1");
    expect(result).toEqual(row);
  });

  it("returns undefined when the user is not found", async () => {
    const db = makeMockSql([]);
    const result = await findUserById(db, "missing");
    expect(result).toBeUndefined();
  });
});

describe("emailExists", () => {
  it("returns true when the email is found", async () => {
    const db = makeMockSql([{ exists: true }]);
    expect(await emailExists(db, "a@b.com")).toBe(true);
  });

  it("returns false when the email is not found", async () => {
    const db = makeMockSql([{ exists: false }]);
    expect(await emailExists(db, "new@b.com")).toBe(false);
  });

  it("returns false when the result set is unexpectedly empty", async () => {
    const db = makeMockSql([]);
    expect(await emailExists(db, "x@b.com")).toBe(false);
  });
});

describe("createUser", () => {
  it("returns the created user row", async () => {
    const row = { id: "u2", email: "new@b.com", role: "developer", created_at: new Date() };
    const db = makeMockSql([row]);
    const result = await createUser(db, "new@b.com", "hash123", "developer");
    expect(result).toEqual(row);
  });

  it("throws when the INSERT returns no rows", async () => {
    const db = makeMockSql([]);
    await expect(createUser(db, "x@b.com", "hash", "developer")).rejects.toThrow(
      "Unexpected empty result",
    );
  });
});
