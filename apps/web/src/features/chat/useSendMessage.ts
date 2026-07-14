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
 * Updates or appends the in-flight assistant message without reshuffling siblings.
 *
 * @param messages - Current message list from the query cache.
 * @param assistant - Assistant message fields to write.
 * @returns Updated message list.
 */
function upsertAssistantMessage(
  messages: ChatMessage[] | undefined,
  assistant: ChatMessage,
): ChatMessage[] {
  const list = messages ?? [];
  const index = list.findIndex((message) => message.id === assistant.id);
  if (index === -1) {
    return [...list, assistant];
  }
  const next = [...list];
  next[index] = { ...next[index], ...assistant };
  return next;
}

/**
 * After a messages refetch, keep any streamed assistant text the server missed.
 *
 * @param serverMessages - Messages returned by the API.
 * @param preservedAssistant - Last streamed assistant snapshot from the client cache.
 * @returns Merged list, or the server list unchanged when the answer is already present.
 */
function mergePreservedAssistant(
  serverMessages: ChatMessage[] | undefined,
  preservedAssistant: ChatMessage | undefined,
): ChatMessage[] | undefined {
  if (!preservedAssistant?.content.trim()) {
    return serverMessages;
  }
  const list = serverMessages ?? [];
  if (list.some((message) => message.role === "assistant" && message.content === preservedAssistant.content)) {
    return list;
  }
  return [
    ...list.filter((message) => !message.id.startsWith("optimistic-")),
    {
      ...preservedAssistant,
      id: preservedAssistant.id.startsWith("optimistic-")
        ? `local-${Date.now()}`
        : preservedAssistant.id,
    },
  ];
}

/**
 * Sends a message in a conversation and refreshes affected caches on success.
 * Streams assistant tokens into the React Query cache while the RAG response is in flight.
 * Exposes `stop()` to abort generation end-to-end; the server persists the partial answer.
 * @param conversationId - The conversation the message belongs to.
 * @returns TanStack mutation plus stop helper.
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
      const assistantCreatedAt = new Date().toISOString();
      const messagesKey = chatKeys.messages(conversationId);

      queryClient.setQueryData<ChatMessage[]>(messagesKey, (old) => [
        ...(old ?? []),
        userMessage,
        {
          id: assistantId,
          conversationId,
          role: "assistant",
          content: "",
          createdAt: assistantCreatedAt,
        },
      ]);

      const controller = new AbortController();
      abortRef.current = controller;

      let streamedContent = "";
      try {
        const result = await streamChatQuery(
          { conversationId, question: text },
          {
            signal: controller.signal,
            onToken: (token) => {
              streamedContent += token;
              queryClient.setQueryData<ChatMessage[]>(messagesKey, (old) =>
                upsertAssistantMessage(old, {
                  id: assistantId,
                  conversationId,
                  role: "assistant",
                  content: streamedContent,
                  createdAt: assistantCreatedAt,
                }),
              );
            },
          },
        );

        const finalContent = streamedContent || result.content;
        if (finalContent) {
          queryClient.setQueryData<ChatMessage[]>(messagesKey, (old) =>
            upsertAssistantMessage(old, {
              id: assistantId,
              conversationId,
              role: "assistant",
              content: finalContent,
              createdAt: assistantCreatedAt,
              needsReview: result.needsReview,
              stopped: result.aborted,
            }),
          );
        }
      } finally {
        abortRef.current = null;
      }
    },
    onSettled: async () => {
      const messagesKey = chatKeys.messages(conversationId);
      const before = queryClient.getQueryData<ChatMessage[]>(messagesKey);
      const preservedAssistant = [...(before ?? [])]
        .reverse()
        .find((message) => message.role === "assistant" && message.content.trim().length > 0);

      await queryClient.invalidateQueries({ queryKey: messagesKey });
      queryClient.setQueryData<ChatMessage[]>(messagesKey, (server) =>
        mergePreservedAssistant(server, preservedAssistant),
      );

      void queryClient.invalidateQueries({ queryKey: chatKeys.sessions });
      void queryClient.invalidateQueries({ queryKey: chatKeys.session(conversationId) });
    },
  });

  return {
    ...mutation,
    stop,
  };
}
