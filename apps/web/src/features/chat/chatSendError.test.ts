import { describe, it, expect } from "vitest";
import { ApiClientError } from "@/shared/lib/apiClient";
import { chatSendErrorMessage } from "./chatSendError";

const t = (key: string) => {
  const messages: Record<string, string> = {
    "chat.sendError": "Could not get a reply. Please try again.",
    "chat.errors.ENGINE_UNAVAILABLE":
      "The answer engine is unavailable right now. Check that the engine service is running, then try again.",
    "chat.errors.STREAM_INTERRUPTED":
      "The reply was interrupted before it finished. Please try again.",
    "chat.errors.ENGINE_ERROR":
      "The answer engine failed while generating a reply. Please try again.",
    "chat.errors.VALIDATION_ERROR":
      "That message could not be sent. Check your question and try again.",
    "chat.errors.NOT_FOUND": "This conversation was not found or is no longer available.",
    "chat.errors.UNAUTHORIZED": "Your session expired. Please sign in again.",
    "chat.errors.FORBIDDEN": "You do not have permission to chat in this conversation.",
  };
  return messages[key] ?? key;
};

describe("chatSendErrorMessage", () => {
  it("maps STREAM_INTERRUPTED and ENGINE_ERROR to localized messages", () => {
    expect(
      chatSendErrorMessage(new ApiClientError(502, "STREAM_INTERRUPTED", "terminated"), t),
    ).toContain("interrupted");
    expect(
      chatSendErrorMessage(new ApiClientError(502, "ENGINE_ERROR", "boom"), t),
    ).toContain("failed while generating");
  });

  it("maps ENGINE_UNAVAILABLE to a localized message instead of fetch failed", () => {
    const error = new ApiClientError(502, "ENGINE_UNAVAILABLE", "fetch failed");
    expect(chatSendErrorMessage(error, t)).toContain("answer engine is unavailable");
  });

  it("maps other known API codes to localized messages", () => {
    expect(
      chatSendErrorMessage(new ApiClientError(404, "NOT_FOUND", "Conversation not found."), t),
    ).toContain("not found");
    expect(
      chatSendErrorMessage(new ApiClientError(400, "VALIDATION_ERROR", "bad"), t),
    ).toContain("could not be sent");
  });

  it("uses the API message for unknown codes when it is meaningful", () => {
    const error = new ApiClientError(500, "SOMETHING_ELSE", "Disk full on server");
    expect(chatSendErrorMessage(error, t)).toBe("Disk full on server");
  });

  it("falls back to the generic send error for opaque failures", () => {
    expect(chatSendErrorMessage(new Error("boom"), t)).toBe(
      "Could not get a reply. Please try again.",
    );
    expect(
      chatSendErrorMessage(new ApiClientError(500, "OTHER", "fetch failed"), t),
    ).toBe("Could not get a reply. Please try again.");
  });
});
