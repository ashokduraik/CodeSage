import { ApiError } from "../../platform/errors";

/** Payload encoded in an indexing-events pagination cursor. */
export interface IndexingEventsCursor {
  startedAt: string;
  id: string;
}

/**
 * Encodes a cursor payload as base64url JSON for use in query strings.
 *
 * @param cursor - Last row from the previous page (startedAt + id).
 * @returns Opaque cursor token.
 */
export function encodeIndexingEventsCursor(cursor: IndexingEventsCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

/**
 * Decodes an indexing-events cursor from the query string.
 *
 * @param token - Opaque cursor from a prior response.
 * @returns Parsed cursor payload.
 * @throws {@link ApiError} 400 when the token is malformed.
 */
export function decodeIndexingEventsCursor(token: string): IndexingEventsCursor {
  try {
    const parsed = JSON.parse(
      Buffer.from(token, "base64url").toString("utf8"),
    ) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "startedAt" in parsed &&
      "id" in parsed &&
      typeof (parsed as IndexingEventsCursor).startedAt === "string" &&
      typeof (parsed as IndexingEventsCursor).id === "string"
    ) {
      return parsed as IndexingEventsCursor;
    }
  } catch {
    // Fall through to validation error below.
  }
  throw new ApiError(400, "VALIDATION_ERROR", "Invalid cursor.");
}
