import { useMutation } from "@tanstack/react-query";
import { markRead } from "@/api/conversations.api";
import { useConversationsStore } from "@/stores/conversations.store";

export function useMarkRead() {
  const { clearUnread } = useConversationsStore();

  return useMutation({
    mutationFn: ({
      conversationId,
      upToMessageId,
    }: {
      conversationId: string;
      upToMessageId: string;
    }) => markRead(conversationId, upToMessageId),
    onSuccess: (_data, variables) => {
      clearUnread(variables.conversationId);
    },
  });
}
