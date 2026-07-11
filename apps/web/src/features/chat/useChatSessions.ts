import { useQuery } from "@tanstack/react-query";
import { listConversations } from "./chatClient";
import type { ChatSession } from "./chatTypes";
import { chatKeys } from "./chatKeys";

/**
 * Loads all chat conversations for the sidebar.
 * @returns TanStack query result with session list (empty when none exist).
 */
export function useChatSessions() {
  return useQuery<ChatSession[], Error>({
    queryKey: chatKeys.sessions,
    queryFn: listConversations,
  });
}
