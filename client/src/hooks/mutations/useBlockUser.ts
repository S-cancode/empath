import { useMutation, useQueryClient } from "@tanstack/react-query";
import { blockUser } from "@/api/conversations.api";
import { queryKeys } from "@/lib/query-keys";

export function useBlockUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (blockedUserId: string) => blockUser(blockedUserId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
      queryClient.invalidateQueries({
        queryKey: queryKeys.archivedConversations,
      });
    },
  });
}
