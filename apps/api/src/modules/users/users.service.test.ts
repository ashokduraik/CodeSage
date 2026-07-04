import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("./users.repository", () => ({
  findUserById: vi.fn(),
  emailExists: vi.fn(),
  createUser: vi.fn(),
  updateUserRole: vi.fn(),
}));

const { getUserById, createNewUser, changeUserRole } = await import("./users.service");
import { findUserById, emailExists, createUser, updateUserRole } from "./users.repository";
import { ApiError } from "../../platform/errors";
import type { Sql } from "../../platform/db";

const mockFindUserById = vi.mocked(findUserById);
const mockEmailExists = vi.mocked(emailExists);
const mockCreateUser = vi.mocked(createUser);
const mockUpdateUserRole = vi.mocked(updateUserRole);

const MOCK_DB = {} as Sql;

afterEach(() => vi.clearAllMocks());

const MOCK_ROW = {
  id: "u1",
  email: "user@example.com",
  role: "developer" as const,
  created_at: new Date("2026-01-01T00:00:00Z"),
};

describe("getUserById", () => {
  it("returns the public user profile when found", async () => {
    mockFindUserById.mockResolvedValue(MOCK_ROW);
    const user = await getUserById(MOCK_DB, "u1");
    expect(user).toEqual({
      id: "u1",
      email: "user@example.com",
      role: "developer",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("throws 404 when the user is not found", async () => {
    mockFindUserById.mockResolvedValue(undefined);
    await expect(getUserById(MOCK_DB, "missing")).rejects.toBeInstanceOf(ApiError);
    await expect(getUserById(MOCK_DB, "missing")).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("createNewUser", () => {
  it("creates and returns the new user when the email is available", async () => {
    mockEmailExists.mockResolvedValue(false);
    mockCreateUser.mockResolvedValue(MOCK_ROW);
    const user = await createNewUser(MOCK_DB, "user@example.com", "password123", "developer", "admin-1");
    expect(user.id).toBe("u1");
    expect(user.email).toBe("user@example.com");
  });

  it("throws 409 when the email is already in use", async () => {
    mockEmailExists.mockResolvedValue(true);
    await expect(
      createNewUser(MOCK_DB, "taken@example.com", "password123", "developer", "admin-1"),
    ).rejects.toMatchObject({ statusCode: 409, code: "EMAIL_IN_USE" });
  });
});

describe("changeUserRole", () => {
  it("returns the updated user profile when found", async () => {
    mockUpdateUserRole.mockResolvedValue({ ...MOCK_ROW, role: "expert" });
    const user = await changeUserRole(MOCK_DB, "u1", "expert", "admin-1");
    expect(user.role).toBe("expert");
  });

  it("throws 404 when the user is not found", async () => {
    mockUpdateUserRole.mockResolvedValue(undefined);
    await expect(changeUserRole(MOCK_DB, "missing", "developer", "admin-1")).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
