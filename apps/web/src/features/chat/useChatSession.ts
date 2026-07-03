import { useQuery } from "@tanstack/react-query";
import { getSession } from "./chatStore";
import type { ChatSession } from "./chatTypes";
import { chatKeys } from "./chatKeys";

/**
 * Loads a single chat session by id.
 * @param sessionId - Session id from the route, or undefined when none is selected.
 */
export function useChatSession(sessionId: string | undefined) {
  return useQuery<ChatSession | null, Error>({
    queryKey: chatKeys.session(sessionId ?? ""),
    queryFn: () => (sessionId ? getSession(sessionId) : Promise.resolve(null)),
    enabled: Boolean(sessionId),
  });
}
