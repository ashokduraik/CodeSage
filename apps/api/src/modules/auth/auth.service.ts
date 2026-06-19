import { compare } from "bcryptjs";
import type { FastifyInstance } from "fastify";
import type { Sql } from "../../platform/db";
import { ApiError } from "../../platform/errors";
import type { JwtPayload, UserRole } from "../../platform/auth.plugin";
import type { NodeApi } from "@codesage/shared-types";

/** Database row shape returned by the users table login query. */
interface UserRow {
  id: string;
  email: string;
  role: UserRole;
  password_hash: string;
  created_at: Date;
}

/**
 * Authenticates a user by email and password.
 * Verifies the bcrypt-hashed password, then signs a JWT with the user's identity.
 *
 * @param db - The postgres.js SQL client.
 * @param app - The Fastify instance (used to sign the JWT via `app.jwt.sign`).
 * @param email - The user's email address.
 * @param password - The plaintext password to verify.
 * @returns A {@link NodeApi.components["schemas"]["LoginResponse"]} with the signed token and user.
 * @throws {@link ApiError} 401 if the email is not found or the password does not match.
 */
export async function loginUser(
  db: Sql,
  app: FastifyInstance,
  email: string,
  password: string,
): Promise<NodeApi.components["schemas"]["LoginResponse"]> {
  const rows = await db<UserRow[]>`
    SELECT id, email, role, password_hash, created_at
    FROM users
    WHERE email = ${email}
    LIMIT 1
  `;

  const user = rows[0];
  const passwordMatches = user ? await compare(password, user.password_hash) : false;

  // Always run compare (even on missing user) to prevent timing attacks.
  if (!user || !passwordMatches) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
  }

  const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
  const token = app.jwt.sign(payload, { expiresIn: app.config.jwtTtl });

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      createdAt: user.created_at.toISOString(),
    },
  };
}
