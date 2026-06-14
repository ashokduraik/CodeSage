import type { Sql } from "../../platform/db";
import type { UserRole } from "../../platform/auth.plugin";

/** Shape of a row returned from the `users` table. */
export interface UserRow {
  id: string;
  email: string;
  role: UserRole;
  created_at: Date;
}

/**
 * Finds a user by their UUID.
 * @param db - The postgres.js SQL client.
 * @param id - The user's UUID.
 * @returns The matching {@link UserRow}, or `undefined` if not found.
 */
export async function findUserById(db: Sql, id: string): Promise<UserRow | undefined> {
  const rows = await db<UserRow[]>`
    SELECT id, email, role, created_at
    FROM users
    WHERE id = ${id}
    LIMIT 1
  `;
  return rows[0];
}

/**
 * Checks whether a user with the given email already exists.
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
 * Inserts a new user row into the `users` table.
 * @param db - The postgres.js SQL client.
 * @param email - The new user's email address.
 * @param passwordHash - bcrypt hash of the user's password.
 * @param role - RBAC role to assign.
 * @returns The created {@link UserRow}.
 */
export async function createUser(
  db: Sql,
  email: string,
  passwordHash: string,
  role: UserRole,
): Promise<UserRow> {
  const rows = await db<UserRow[]>`
    INSERT INTO users (email, password_hash, role)
    VALUES (${email}, ${passwordHash}, ${role})
    RETURNING id, email, role, created_at
  `;
  const row = rows[0];
  if (!row) {
    throw new Error("Unexpected empty result from user INSERT.");
  }
  return row;
}
