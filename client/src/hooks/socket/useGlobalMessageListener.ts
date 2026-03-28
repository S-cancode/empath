import { useEffect } from "react";
import { AppState } from "react-native";
import { useSocket } from "@/providers/SocketProvider";
import { useConversationsStore, type MatchProposal } from "@/stores/conversations.store";
import { useAuthStore } from "@/stores/auth.store";
import { useConversations } from "@/hooks/queries/useConversations";
import { queryClient } from "@/providers/QueryProvider";
import { queryKeys } from "@/lib/query-keys";
import { apiClient } from "@/api/client";

/**
 * Global listener that joins all conversation rooms on socket connect
 * and increments unread counts for incoming messages from any screen.
 */
export function useGlobalMessageListener() {
  const { socket } = useSocket();
  const userId = useAuthStore((s) => s.user?.id);
  const { incrementUnread, setMatchProposal, setIsSearching } = useConversationsStore();
  const { data: conversations } = useConversations();

  // Join all conversation rooms so we receive messages from any screen
  useEffect(() => {
    if (!socket || !conversations) return;
    for (const conv of conversations) {
      socket.emit("conversation:join", { conversationId: conv.id });
    }
  }, [socket, conversations]);

  // Listen for incoming messages globally — increment unread + refetch inbox
  useEffect(() => {
    if (!socket || !userId) return;

    const handler = (data: {
      conversationId: string;
      messageId: string;
      senderId: string;
      content: string;
      sentAt: string;
      messageType?: string;
      voiceDurationMs?: number;
      waveform?: number[];
    }) => {
      if (data.senderId === userId) return;
      // Don't increment unread if the user is currently viewing this conversation
      const activeId = useConversationsStore.getState().activeConversationId;
      if (data.conversationId !== activeId) {
        incrementUnread(data.conversationId);
      }

      // Inject message into the React Query cache so it's ready instantly
      const newMessage = {
        id: data.messageId,
        senderId: data.senderId,
        content: data.content,
        sentAt: data.sentAt,
        deliveryStatus: "delivered" as const,
        messageType: data.messageType ?? "text",
        voiceDurationMs: data.voiceDurationMs ?? null,
        waveform: data.waveform ?? null,
      };
      queryClient.setQueryData(
        queryKeys.messages(data.conversationId),
        (old: any) => {
          if (!old?.pages?.length) return old;
          const firstPage = old.pages[0] ?? [];
          if (firstPage.some((m: any) => m.id === newMessage.id)) return old;
          return {
            ...old,
            pages: [[newMessage, ...firstPage], ...old.pages.slice(1)],
          };
        }
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
    };

    socket.on("conversation:message" as any, handler);
    return () => {
      socket.off("conversation:message" as any, handler);
    };
  }, [socket, userId, incrementUnread]);

  // Check for pending proposals on socket connect and app foreground
  useEffect(() => {
    if (!socket) return;

    const checkPendingProposal = async () => {
      try {
        const { data } = await apiClient.get("/match/queue-status");
        if (data.pendingProposal) {
          setIsSearching(false);
          setMatchProposal(data.pendingProposal);
        }
      } catch {}
    };

    // Check on socket connect (covers reconnects)
    checkPendingProposal();

    // Check when app comes to foreground
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") checkPendingProposal();
    });

    return () => subscription.remove();
  }, [socket, setMatchProposal, setIsSearching]);

  // Listen for match proposals
  useEffect(() => {
    if (!socket) return;

    const proposalHandler = (data: {
      proposalId: string;
      partnerSummary: string;
      partnerCategory: string;
    }) => {
      setIsSearching(false);
      setMatchProposal(data);
    };

    const confirmedHandler = (data: { conversationId: string }) => {
      setMatchProposal(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
    };

    const declinedHandler = () => {
      // Partner declined — back to searching
      setMatchProposal(null);
      setIsSearching(true);
    };

    socket.on("match:proposed" as any, proposalHandler);
    socket.on("match:confirmed" as any, confirmedHandler);
    socket.on("match:declined" as any, declinedHandler);

    return () => {
      socket.off("match:proposed" as any, proposalHandler);
      socket.off("match:confirmed" as any, confirmedHandler);
      socket.off("match:declined" as any, declinedHandler);
    };
  }, [socket, setMatchProposal, setIsSearching]);
}
