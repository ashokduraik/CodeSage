import { useQuery } from "@tanstack/react-query";
import { listSessions } from "./chatStore";
import type { ChatSession } from "./chatTypes";
import { chatKeys } from "./chatKeys";

/**
 * Loads all chat sessions for the sidebar.
 * @returns TanStack query result with session list (empty when none exist).
 */
export function useChatSessions() {
  return useQuery<ChatSession[], Error>({
    queryKey: chatKeys.sessions,
    queryFn: listSessions,
  });
}
