import { useQuery } from "@tanstack/react-query";
import { listSessions, type ChatSession } from "@/shared/mock";
import { chatKeys } from "./chatKeys";

/**
 * Lists chat sessions, ordered by most recent activity.
 * @returns The TanStack Query result for the session list.
 */
export function useChatSessions() {
  return useQuery<ChatSession[], Error>({
    queryKey: chatKeys.sessions,
    queryFn: () => listSessions(),
  });
}
