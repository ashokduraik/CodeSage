/** Callback invoked when an authenticated API request returns 401. */
type UnauthorizedHandler = () => void;

let handler: UnauthorizedHandler | null = null;
let isNotifying = false;

/**
 * Registers the global 401 handler (typically session invalidation).
 * Resets the dedupe guard so a new login can receive a fresh notification.
 *
 * @param fn - Handler to call on 401, or `null` to clear.
 */
export function setUnauthorizedHandler(fn: UnauthorizedHandler | null): void {
  handler = fn;
  isNotifying = false;
}

/**
 * Invokes the registered 401 handler at most once per handler registration.
 * Concurrent 401s from parallel requests are deduplicated.
 */
export function notifyUnauthorized(): void {
  if (!handler || isNotifying) {
    return;
  }
  isNotifying = true;
  handler();
}
