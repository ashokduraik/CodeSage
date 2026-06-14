import { useMutation, useQueryClient } from "@tanstack/react-query";
import { sendMessage, type SendMessageResult } from "@/shared/mock";
import { chatKeys } from "./chatKeys";

/**
 * Sends a message in a session and refreshes the affected caches on success.
 * @param sessionId - The session the message belongs to.
 * @returns A TanStack mutation accepting the message text.
 */
export function useSendMessage(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation<SendMessageResult, Error, string>({
    mutationFn: (text) => sendMessage(sessionId, text),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.messages(sessionId) });
      void queryClient.invalidateQueries({ queryKey: chatKeys.sessions });
      void queryClient.invalidateQueries({ queryKey: chatKeys.session(sessionId) });
    },
  });
}
