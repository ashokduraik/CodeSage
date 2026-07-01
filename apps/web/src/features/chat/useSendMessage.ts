import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  appendMessagePair,
  getSession,
  sendMessage,
  type ChatMessage,
  type SendMessageResult,
} from "@/shared/mock";
import { streamChatQuery } from "./chatClient";
import { chatKeys } from "./chatKeys";

let messageCounter = 0;

/** Generates a short unique message id. */
function nextMessageId(): string {
  messageCounter += 1;
  return `m-${Date.now()}-${messageCounter}`;
}

/**
 * Sends a message in a session and refreshes the affected caches on success.
 * Uses the real RAG-backed API when the session is scoped to a project; otherwise
 * falls back to the in-memory mock for unscoped sessions.
 * @param sessionId - The session the message belongs to.
 * @returns A TanStack mutation accepting the message text.
 */
export function useSendMessage(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation<SendMessageResult, Error, string>({
    mutationFn: async (text) => {
      const session = await getSession(sessionId);
      if (!session) {
        throw new Error(`unknown session: ${sessionId}`);
      }

      if (session.projectId && session.mode === "developer") {
        const userMessage: ChatMessage = {
          id: nextMessageId(),
          sessionId,
          role: "user",
          content: text,
        };
        const result = await streamChatQuery({
          question: text,
          projectId: session.projectId,
          audience: session.mode,
        });
        const assistantMessage: ChatMessage = {
          id: nextMessageId(),
          sessionId,
          role: "assistant",
          content: result.content,
          confidence: result.confidence,
          sources: result.sources,
          needsReview: result.needsReview,
        };
        return appendMessagePair(sessionId, userMessage, assistantMessage);
      }

      return sendMessage(sessionId, text);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.messages(sessionId) });
      void queryClient.invalidateQueries({ queryKey: chatKeys.sessions });
      void queryClient.invalidateQueries({ queryKey: chatKeys.session(sessionId) });
    },
  });
}
