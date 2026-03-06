import { useMutation, useQueryClient } from "@tanstack/react-query";
import { archiveConversation } from "@/api/conversations.api";
import { queryKeys } from "@/lib/query-keys";

export function useArchiveConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: string) =>
      archiveConversation(conversationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
      queryClient.invalidateQueries({
        queryKey: queryKeys.archivedConversations,
      });
    },
  });
}
