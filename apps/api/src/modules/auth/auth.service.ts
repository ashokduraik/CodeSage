import { compare } from "bcryptjs";
import type { FastifyInstance } from "fastify";
import type { Sql } from "../../platform/db";
import { ApiError } from "../../platform/errors";
import type { JwtPayload, UserRole } from "../../platform/auth.plugin";
import { isServiceUserRole } from "../../platform/serviceUsers";
import type { NodeApi } from "@codesage/shared-types";

type LoginResponse = NodeApi.components["schemas"]["LoginResponse"];

/** Database row shape returned by the users table login query. */
interface UserRow {
  id: string;
  email: string;
  role: string;
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
 * @returns A {@link LoginResponse} with the signed token and user.
 * @throws {@link ApiError} 401 if the email is not found or the password does not match.
 */
export async function loginUser(
  db: Sql,
  app: FastifyInstance,
  email: string,
  password: string,
): Promise<LoginResponse> {
  const rows = await db<UserRow[]>`
    SELECT id, email, role::text AS role, password_hash, created_at
    FROM users
    WHERE email = ${email}
    LIMIT 1
  `;

  const user = rows[0];
  const passwordMatches = user ? await compare(password, user.password_hash) : false;

  if (!user || !passwordMatches || isServiceUserRole(user.role)) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
  }

  const payload: JwtPayload = {
    sub: user.id,
    email: user.email,
    role: user.role as UserRole,
  };
  const token = app.jwt.sign(payload, { expiresIn: app.config.jwtTtl });

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role as UserRole,
      createdAt: user.created_at.toISOString(),
    },
  };
}
