import { useMutation, useQueryClient } from "@tanstack/react-query";
import { appendAssistantMessage, appendUserMessage, getSession, listMessages } from "./chatStore";
import type { ChatMessage, SendMessageResult } from "./chatTypes";
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
 * On the first message, requests an LLM-generated title alongside the answer.
 * Streams assistant tokens into the React Query cache while the RAG response is in flight.
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
      if (!session.projectId) {
        throw new Error("session must be scoped to a project");
      }

      const existingMessages = await listMessages(sessionId);
      const isFirstMessage = existingMessages.length === 0;

      const userMessage: ChatMessage = {
        id: nextMessageId(),
        sessionId,
        role: "user",
        content: text,
      };
      const assistantId = nextMessageId();

      await appendUserMessage(sessionId, userMessage);
      queryClient.setQueryData<ChatMessage[]>(chatKeys.messages(sessionId), (old) => [
        ...(old ?? []),
        userMessage,
      ]);

      let streamedContent = "";
      const result = await streamChatQuery(
        {
          question: text,
          projectId: session.projectId,
          audience: session.mode,
          generateTitle: isFirstMessage,
        },
        (token) => {
          streamedContent += token;
          queryClient.setQueryData<ChatMessage[]>(chatKeys.messages(sessionId), (old) => {
            const base = (old ?? []).filter((message) => message.id !== assistantId);
            return [
              ...base,
              {
                id: assistantId,
                sessionId,
                role: "assistant",
                content: streamedContent,
              },
            ];
          });
        },
      );

      const assistantMessage: ChatMessage = {
        id: assistantId,
        sessionId,
        role: "assistant",
        content: result.content,
        confidence: result.confidence,
        sources: result.sources,
        needsReview: result.needsReview,
        metrics: result.metrics,
      };

      return appendAssistantMessage(sessionId, assistantMessage, result.title);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.messages(sessionId) });
      void queryClient.invalidateQueries({ queryKey: chatKeys.sessions });
      void queryClient.invalidateQueries({ queryKey: chatKeys.session(sessionId) });
    },
  });
}
