import { useQuery } from "@tanstack/react-query";
import { listMessages } from "./chatStore";
import type { ChatMessage } from "./chatTypes";
import { chatKeys } from "./chatKeys";

/**
 * Loads the messages for a session, disabled until a session id is provided.
 * @param sessionId - The active session id, or undefined when none is selected.
 * @returns The TanStack Query result for the message list.
 */
export function useChatMessages(sessionId: string | undefined) {
  return useQuery<ChatMessage[], Error>({
    queryKey: chatKeys.messages(sessionId ?? ""),
    // Only runs when enabled, so `sessionId` is guaranteed to be defined here.
    queryFn: () => listMessages(sessionId as string),
    enabled: Boolean(sessionId),
  });
}
