import { useQuery } from "@tanstack/react-query";
import { listConversationMessages } from "./chatClient";
import type { ChatMessage } from "./chatTypes";
import { chatKeys } from "./chatKeys";

/**
 * Loads the messages for a conversation, disabled until an id is provided.
 * @param sessionId - The active conversation id, or undefined when none is selected.
 * @returns The TanStack Query result for the message list.
 */
export function useChatMessages(sessionId: string | undefined) {
  return useQuery<ChatMessage[], Error>({
    queryKey: chatKeys.messages(sessionId ?? ""),
    queryFn: () => listConversationMessages(sessionId as string),
    enabled: Boolean(sessionId),
  });
}
