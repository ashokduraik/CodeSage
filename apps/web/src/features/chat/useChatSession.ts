import { useQuery } from "@tanstack/react-query";
import { getConversation } from "./chatClient";
import type { ChatSession } from "./chatTypes";
import { chatKeys } from "./chatKeys";

/**
 * Loads a single chat conversation by id.
 * @param sessionId - Conversation id from the route, or undefined when none is selected.
 */
export function useChatSession(sessionId: string | undefined) {
  return useQuery<ChatSession, Error>({
    queryKey: chatKeys.session(sessionId ?? ""),
    queryFn: () => getConversation(sessionId as string),
    enabled: Boolean(sessionId),
  });
}
