import { isApiClientError } from "@/shared/lib/apiClient";

/** API error codes that have dedicated chat i18n messages. */
const KNOWN_CHAT_ERROR_CODES = new Set([
  "ENGINE_UNAVAILABLE",
  "STREAM_INTERRUPTED",
  "ENGINE_ERROR",
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "UNAUTHORIZED",
  "FORBIDDEN",
]);

/** Opaque transport messages that must not be shown verbatim in the UI. */
const OPAQUE_MESSAGES = new Set(["fetch failed", "terminated", "Failed to fetch"]);

/**
 * Maps a chat send / stream failure to a user-facing message.
 * Prefer localized messages for known API codes; avoid raw transport strings
 * like "fetch failed" that are meaningless in the product UI.
 *
 * @param error - Error thrown by {@link streamChatQuery} or the send mutation.
 * @param t - i18n translate function.
 * @returns Localized or API-provided message safe to show in the chat UI.
 */
export function chatSendErrorMessage(
  error: unknown,
  t: (key: string) => string,
): string {
  if (isApiClientError(error) && KNOWN_CHAT_ERROR_CODES.has(error.code)) {
    return t(`chat.errors.${error.code}`);
  }
  if (
    isApiClientError(error)
    && error.message.trim()
    && !OPAQUE_MESSAGES.has(error.message)
  ) {
    return error.message;
  }
  return t("chat.sendError");
}
