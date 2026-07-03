import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createSession } from "./chatStore";
import type { ChatSession, NewChatInput } from "./chatTypes";
import { chatKeys } from "./chatKeys";

/**
 * Creates a chat session and refreshes the session list on success.
 * @returns A TanStack mutation accepting {@link NewChatInput}, resolving to the session.
 */
export function useCreateSession() {
  const queryClient = useQueryClient();
  return useMutation<ChatSession, Error, NewChatInput>({
    mutationFn: (input) => createSession(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.sessions });
    },
  });
}
