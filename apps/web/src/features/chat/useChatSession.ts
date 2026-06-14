import { useQuery } from "@tanstack/react-query";
import { getSession, type ChatSession } from "@/shared/mock";
import { chatKeys } from "./chatKeys";

/**
 * Loads a single chat session, disabled until a session id is provided.
 * @param sessionId - The active session id, or undefined when none is selected.
 * @returns The TanStack Query result for the session (data may be null).
 */
export function useChatSession(sessionId: string | undefined) {
  return useQuery<ChatSession | null, Error>({
    queryKey: chatKeys.session(sessionId ?? ""),
    // Only runs when enabled, so `sessionId` is guaranteed to be defined here.
    queryFn: () => getSession(sessionId as string),
    enabled: Boolean(sessionId),
  });
}
