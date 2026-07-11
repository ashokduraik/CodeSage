import { useCallback, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ChatMessage } from "./chatTypes";
import { streamChatQuery } from "./chatClient";
import { chatKeys } from "./chatKeys";

let messageCounter = 0;

/** Generates a short unique optimistic message id. */
function nextOptimisticId(): string {
  messageCounter += 1;
  return `optimistic-${Date.now()}-${messageCounter}`;
}

/**
 * Sends a message in a conversation and refreshes affected caches on success.
 * Streams assistant tokens into the React Query cache while the RAG response is in flight.
 * Exposes `stop()` to abort generation end-to-end; the server persists the partial answer.
 * @param conversationId - The conversation the message belongs to.
 * @returns TanStack mutation plus a `stop` function for in-flight streams.
 */
export function useSendMessage(conversationId: string) {
  const queryClient = useQueryClient();
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const mutation = useMutation<void, Error, string>({
    mutationFn: async (text) => {
      const userMessage: ChatMessage = {
        id: nextOptimisticId(),
        conversationId,
        role: "user",
        content: text,
        createdAt: new Date().toISOString(),
      };
      const assistantId = nextOptimisticId();

      queryClient.setQueryData<ChatMessage[]>(chatKeys.messages(conversationId), (old) => [
        ...(old ?? []),
        userMessage,
      ]);

      const controller = new AbortController();
      abortRef.current = controller;

      let streamedContent = "";
      await streamChatQuery(
        { conversationId, question: text },
        {
          signal: controller.signal,
          onToken: (token) => {
            streamedContent += token;
            queryClient.setQueryData<ChatMessage[]>(chatKeys.messages(conversationId), (old) => {
              const base = (old ?? []).filter((message) => message.id !== assistantId);
              return [
                ...base,
                {
                  id: assistantId,
                  conversationId,
                  role: "assistant",
                  content: streamedContent,
                  createdAt: new Date().toISOString(),
                },
              ];
            });
          },
        },
      );

      abortRef.current = null;
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.messages(conversationId) });
      void queryClient.invalidateQueries({ queryKey: chatKeys.sessions });
      void queryClient.invalidateQueries({ queryKey: chatKeys.session(conversationId) });
    },
  });

  return { ...mutation, stop };
}
