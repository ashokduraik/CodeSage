import { describe, it, expect, vi } from "vitest";
import { findUserById, emailExists, createUser, updateUserRole } from "./users.repository";
import { API_SYSTEM_USER_ID } from "../../platform/serviceUsers";
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

  it("returns undefined for service account ids without querying", async () => {
    const db = makeMockSql([]);
    const result = await findUserById(db, API_SYSTEM_USER_ID);
    expect(result).toBeUndefined();
    expect(db).not.toHaveBeenCalled();
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
    const result = await createUser(db, "new@b.com", "hash123", "developer", "admin-1");
    expect(result).toEqual(row);
  });

  it("throws when role is system", async () => {
    const db = makeMockSql([]);
    await expect(
      createUser(db, "x@b.com", "hash", "system" as "developer", "admin-1"),
    ).rejects.toThrow(/Cannot create users with system role/);
  });

  it("throws when the INSERT returns no rows", async () => {
    const db = makeMockSql([]);
    await expect(createUser(db, "x@b.com", "hash", "developer", "admin-1")).rejects.toThrow(
      "Unexpected empty result",
    );
  });
});

describe("updateUserRole", () => {
  it("returns the updated user row when found", async () => {
    const row = { id: "u1", email: "a@b.com", role: "expert" as const, created_at: new Date() };
    const db = makeMockSql([row]);
    const result = await updateUserRole(db, "u1", "expert", "admin-1");
    expect(result).toEqual(row);
  });

  it("returns undefined when the user is not found", async () => {
    const db = makeMockSql([]);
    const result = await updateUserRole(db, "missing", "developer", "admin-1");
    expect(result).toBeUndefined();
  });
});
