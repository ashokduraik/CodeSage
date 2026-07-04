import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("./users.repository", () => ({
  searchUsersByEmailPrefix: vi.fn(),
}));

const { searchUsers } = await import("./users.service");
import { searchUsersByEmailPrefix } from "./users.repository";
import type { Sql } from "../../platform/db";

const mockSearch = vi.mocked(searchUsersByEmailPrefix);
const DB = {} as Sql;

afterEach(() => vi.clearAllMocks());

describe("searchUsers", () => {
  it("maps rows including isSystem flag", async () => {
    mockSearch.mockResolvedValue([
      { id: "u1", email: "alice@example.com", role: "admin" },
      { id: "s1", email: "rag-worker@codesage.internal", role: "system" },
    ]);
    const result = await searchUsers(DB, "al");
    expect(result).toEqual([
      { id: "u1", email: "alice@example.com", isSystem: false },
      { id: "s1", email: "rag-worker@codesage.internal", isSystem: true },
    ]);
    expect(mockSearch).toHaveBeenCalledWith(DB, "al", 10);
  });

  it("throws when query is shorter than 2 characters", async () => {
    await expect(searchUsers(DB, "a")).rejects.toMatchObject({ statusCode: 400 });
  });
});
