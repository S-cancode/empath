import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { useConversationsStore } from "@/stores/conversations.store";
import { useAuthStore } from "@/stores/auth.store";
import { useSocket } from "@/providers/SocketProvider";
import * as Crypto from "expo-crypto";

export function useSendMessage(conversationId: string) {
  const queryClient = useQueryClient();
  const { addOptimisticMessage } = useConversationsStore();
  const userId = useAuthStore((s) => s.user?.id);
  const { socket } = useSocket();

  return useMutation({
    mutationFn: async (content: string) => {
      const tempId = Crypto.randomUUID();

      // Show immediately as "sending"
      addOptimisticMessage({
        id: tempId,
        conversationId,
        senderId: userId!,
        content,
        sentAt: new Date().toISOString(),
        deliveryStatus: "sending",
        isOptimistic: true,
      });

      // Send via Socket.IO for real-time delivery + persistence
      socket?.emit("conversation:message", { conversationId, content });

      return { id: tempId, sentAt: new Date().toISOString() };
    },
    onSuccess: () => {
      // Refetch server messages — dedup will drop the optimistic copy
      queryClient.invalidateQueries({
        queryKey: queryKeys.messages(conversationId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
    },
  });
}
