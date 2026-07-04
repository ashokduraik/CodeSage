import { hash } from "bcryptjs";
import type { Sql } from "../../platform/db";
import { ApiError } from "../../platform/errors";
import type { UserRole } from "../../platform/auth.plugin";
import { isServiceUserRole } from "../../platform/serviceUsers";
import { emailExists, createUser, findUserById, updateUserRole, searchUsersByEmailPrefix } from "./users.repository";
import type { NodeApi } from "@codesage/shared-types";

/** bcrypt cost factor — 12 is the OWASP-recommended minimum for 2025+. */
const BCRYPT_ROUNDS = 12;

/**
 * Converts a {@link UserRow}-shaped object to the public {@link NodeApi.components["schemas"]["User"]}
 * response shape (no password_hash, dates as ISO strings).
 */
function toUserResponse(row: {
  id: string;
  email: string;
  role: UserRole;
  created_at: Date;
}): NodeApi.components["schemas"]["User"] {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    createdAt: row.created_at.toISOString(),
  };
}

/**
 * Returns the public profile of a user by ID.
 * @param db - The postgres.js SQL client.
 * @param id - The user's UUID.
 * @returns The public user profile.
 * @throws {@link ApiError} 404 when the user does not exist.
 */
export async function getUserById(
  db: Sql,
  id: string,
): Promise<NodeApi.components["schemas"]["User"]> {
  const row = await findUserById(db, id);
  if (!row) {
    throw new ApiError(404, "NOT_FOUND", "User not found.");
  }
  return toUserResponse(row);
}

/**
 * Creates a new user account (admin-only operation).
 * @param db - The postgres.js SQL client.
 * @param email - Email address for the new account.
 * @param password - Plaintext password (will be hashed with bcrypt).
 * @param role - RBAC role to assign.
 * @returns The newly created public user profile.
 * @throws {@link ApiError} 409 when the email address is already in use.
 */
export async function createNewUser(
  db: Sql,
  email: string,
  password: string,
  role: UserRole,
  actorId: string,
): Promise<NodeApi.components["schemas"]["User"]> {
  const taken = await emailExists(db, email);
  if (taken) {
    throw new ApiError(409, "EMAIL_IN_USE", "An account with that email already exists.");
  }
  const passwordHash = await hash(password, BCRYPT_ROUNDS);
  const row = await createUser(db, email, passwordHash, role, actorId);
  return toUserResponse(row);
}

/**
 * Updates the RBAC role of an existing user (admin-only operation).
 * @param db - The postgres.js SQL client.
 * @param id - UUID of the user to update.
 * @param role - New RBAC role to assign.
 * @returns The updated public user profile.
 * @throws {@link ApiError} 404 when the user does not exist.
 */
export async function changeUserRole(
  db: Sql,
  id: string,
  role: UserRole,
  actorId: string,
): Promise<NodeApi.components["schemas"]["User"]> {
  const row = await updateUserRole(db, id, role, actorId);
  if (!row) {
    throw new ApiError(404, "NOT_FOUND", "User not found.");
  }
  return toUserResponse(row);
}

/** Maximum autocomplete results per request. */
const MAX_USER_SEARCH_LIMIT = 20;

/** Default autocomplete result limit. */
const DEFAULT_USER_SEARCH_LIMIT = 10;

/**
 * Prefix-searches users by email for admin autocomplete (includes service accounts).
 *
 * @param db - postgres.js client.
 * @param query - Email prefix (minimum 2 characters).
 * @param limit - Max results (capped at 20).
 * @returns Matching user search results.
 * @throws {@link ApiError} 400 when query is too short.
 */
export async function searchUsers(
  db: Sql,
  query: string,
  limit?: number,
): Promise<NodeApi.components["schemas"]["UserSearchResult"][]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    throw new ApiError(400, "VALIDATION_ERROR", "Search query must be at least 2 characters.");
  }
  const cappedLimit = Math.min(MAX_USER_SEARCH_LIMIT, Math.max(1, limit ?? DEFAULT_USER_SEARCH_LIMIT));
  const rows = await searchUsersByEmailPrefix(db, trimmed, cappedLimit);
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    isSystem: isServiceUserRole(row.role),
  }));
}
