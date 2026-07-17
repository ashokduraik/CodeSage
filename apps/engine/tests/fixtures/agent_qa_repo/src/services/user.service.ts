/** Minimal symbol used to verify exact class lookup in golden QA tests. */
export class UserService {
  /**
   * Returns a stable display name for a user.
   *
   * @param email - User email address.
   * @returns The local email component.
   */
  displayName(email: string): string {
    return email.split('@')[0] ?? email;
  }
}
