import { useMutation, useQueryClient } from "@tanstack/react-query";
import { reconnect } from "@/api/conversations.api";
import { queryKeys } from "@/lib/query-keys";

export function useReconnect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: string) => reconnect(conversationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
      queryClient.invalidateQueries({
        queryKey: queryKeys.archivedConversations,
      });
    },
  });
}
