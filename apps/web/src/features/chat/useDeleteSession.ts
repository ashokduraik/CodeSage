import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteConversation } from "./chatClient";
import { chatKeys } from "./chatKeys";

/**
 * Soft-deletes a chat conversation and refreshes affected caches on success.
 * @returns A TanStack mutation accepting a conversation id.
 */
export function useDeleteSession() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (conversationId) => deleteConversation(conversationId),
    onSuccess: (_data, conversationId) => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.sessions });
      void queryClient.invalidateQueries({ queryKey: chatKeys.session(conversationId) });
      void queryClient.invalidateQueries({ queryKey: chatKeys.messages(conversationId) });
    },
  });
}
