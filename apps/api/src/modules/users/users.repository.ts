import type { Sql } from "../../platform/db";
import type { UserRole } from "../../platform/auth.plugin";
import { isServiceUserId, isServiceUserRole, SYSTEM_USER_ROLE } from "../../platform/serviceUsers";
import { ROW_STATUS } from "../../platform/rowStatus";

/** Shape of a row returned from the `users` table. */
export interface UserRow {
  id: string;
  email: string;
  role: UserRole;
  created_at: Date;
}

/**
 * Finds a human (non-system) user by UUID.
 *
 * @param db - The postgres.js SQL client.
 * @param id - The user's UUID.
 * @returns The matching {@link UserRow}, or `undefined` if not found or a service account.
 */
export async function findHumanUserById(db: Sql, id: string): Promise<UserRow | undefined> {
  if (isServiceUserId(id)) {
    return undefined;
  }
  const rows = await db<UserRow[]>`
    SELECT id, email, role, created_at
    FROM users
    WHERE id = ${id}
      AND role::text <> ${SYSTEM_USER_ROLE}
    LIMIT 1
  `;
  return rows[0];
}

/**
 * @deprecated Use {@link findHumanUserById} for API-facing lookups.
 */
export async function findUserById(db: Sql, id: string): Promise<UserRow | undefined> {
  return findHumanUserById(db, id);
}

/**
 * Checks whether a user with the given email already exists.
 *
 * @param db - The postgres.js SQL client.
 * @param email - Email address to check.
 * @returns `true` when the email is already in use.
 */
export async function emailExists(db: Sql, email: string): Promise<boolean> {
  const rows = await db<{ exists: boolean }[]>`
    SELECT EXISTS (SELECT 1 FROM users WHERE email = ${email}) AS exists
  `;
  return rows[0]?.exists ?? false;
}

/**
 * Inserts a new human user row into the `users` table.
 *
 * @param db - The postgres.js SQL client.
 * @param email - The new user's email address.
 * @param passwordHash - bcrypt hash of the user's password.
 * @param role - RBAC role to assign (must not be `system`).
 * @param actorId - UUID for `created_by` and `updated_by`.
 * @returns The created {@link UserRow}.
 */
export async function createUser(
  db: Sql,
  email: string,
  passwordHash: string,
  role: UserRole,
  actorId: string,
): Promise<UserRow> {
  if (isServiceUserRole(role)) {
    throw new Error("Cannot create users with system role via API.");
  }
  const rows = await db<UserRow[]>`
    INSERT INTO users (email, password_hash, role, created_by, updated_by)
    VALUES (${email}, ${passwordHash}, ${role}, ${actorId}, ${actorId})
    RETURNING id, email, role, created_at
  `;
  const row = rows[0];
  if (!row) {
    throw new Error("Unexpected empty result from user INSERT.");
  }
  return row;
}

/**
 * Updates the RBAC role of an existing human user.
 *
 * @param db - The postgres.js SQL client.
 * @param id - The user's UUID.
 * @param role - New RBAC role to assign.
 * @param actorId - UUID for `updated_by`.
 * @returns The updated {@link UserRow}, or `undefined` when the user does not exist.
 */
export async function updateUserRole(
  db: Sql,
  id: string,
  role: UserRole,
  actorId: string,
): Promise<UserRow | undefined> {
  if (isServiceUserId(id) || isServiceUserRole(role)) {
    return undefined;
  }
  const rows = await db<UserRow[]>`
    UPDATE users
    SET role = ${role},
        updated_by = ${actorId}
    WHERE id = ${id}
      AND role::text <> ${SYSTEM_USER_ROLE}
    RETURNING id, email, role, created_at
  `;
  return rows[0];
}

/** Row returned from prefix user search (includes service accounts). */
export interface UserSearchRow {
  id: string;
  email: string;
  role: string;
}

/**
 * Prefix-searches active users by email (case-insensitive).
 * Includes internal service accounts for audit actor autocomplete.
 *
 * @param db - postgres.js client.
 * @param prefix - Email prefix (not wrapped with wildcards).
 * @param limit - Maximum rows to return.
 */
export async function searchUsersByEmailPrefix(
  db: Sql,
  prefix: string,
  limit: number,
): Promise<UserSearchRow[]> {
  const pattern = `${prefix}%`;
  return db<UserSearchRow[]>`
    SELECT id, email, role::text AS role
    FROM users
    WHERE status = ${ROW_STATUS.ACTIVE}
      AND email ILIKE ${pattern}
    ORDER BY email
    LIMIT ${limit}
  `;
}
