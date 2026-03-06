import { useEffect, useRef, useState, useCallback } from "react";
import { useSocket } from "@/providers/SocketProvider";
import { useSocketEvent } from "./useSocketEvent";
import { useConversationsStore } from "@/stores/conversations.store";
import { useAuthStore } from "@/stores/auth.store";
import { queryClient } from "@/providers/QueryProvider";
import { queryKeys } from "@/lib/query-keys";
import type { CrisisResource } from "@/types/socket";

interface LiveSessionInvite {
  conversationId: string;
  inviterId: string;
}

interface CrisisData {
  resources: CrisisResource[];
  keywords: string[];
}

export function useConversationSocket(conversationId: string) {
  const { socket } = useSocket();
  const userId = useAuthStore((s) => s.user?.id);
  const { setPresence, setTyping } =
    useConversationsStore();
  const [liveSessionInvite, setLiveSessionInvite] =
    useState<LiveSessionInvite | null>(null);
  const [crisisData, setCrisisData] = useState<CrisisData | null>(null);
  const isOnline = useConversationsStore((s) => s.presence[conversationId]);
  const isTyping = useConversationsStore((s) => s.typing[conversationId]);
  const typingTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Join conversation room
  useEffect(() => {
    if (!socket || !conversationId) return;
    socket.emit("conversation:join", { conversationId });
  }, [socket, conversationId]);

  // Incoming async message — inject directly into React Query cache for instant render
  useSocketEvent<{
    messageId: string;
    senderId: string;
    content: string;
    sentAt: string;
    messageType?: string;
    voiceDurationMs?: number;
    waveform?: number[];
  }>("conversation:message", (data) => {
    if (data.senderId === userId) return; // Skip own messages

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

    // Instantly prepend to the first page of the messages cache
    queryClient.setQueryData(
      queryKeys.messages(conversationId),
      (old: any) => {
        if (!old?.pages?.length) return old;
        const firstPage = old.pages[0] ?? [];
        // Avoid duplicates
        if (firstPage.some((m: any) => m.id === newMessage.id)) return old;
        return {
          ...old,
          pages: [[newMessage, ...firstPage], ...old.pages.slice(1)],
        };
      }
    );
    queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
  });

  // Typing indicator
  useSocketEvent<{ userId: string }>("typing", (data) => {
    if (data.userId === userId) return;
    setTyping(conversationId, true);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => setTyping(conversationId, false), 3000);
  });

  // Presence
  useSocketEvent<{ conversationId: string; partnerId: string }>(
    "match:online",
    (data) => {
      if (data.conversationId === conversationId) setPresence(conversationId, true);
    }
  );

  useSocketEvent<{ conversationId: string; partnerId: string }>(
    "match:offline",
    (data) => {
      if (data.conversationId === conversationId) setPresence(conversationId, false);
    }
  );

  // Read receipts
  useSocketEvent<{ conversationId: string; upToMessageId: string; readBy: string }>(
    "message:read",
    () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.messages(conversationId) });
    }
  );

  // Live session invite
  useSocketEvent<LiveSessionInvite>("livesession:invite", (data) => {
    if (data.conversationId === conversationId) setLiveSessionInvite(data);
  });

  // Crisis detection
  useSocketEvent<CrisisData>("crisis:detected", setCrisisData);

  const acceptInvite = useCallback(() => {
    if (!socket || !liveSessionInvite) return;
    socket.emit("livesession:accept", { conversationId });
    setLiveSessionInvite(null);
  }, [socket, conversationId, liveSessionInvite]);

  const declineInvite = useCallback(() => {
    if (!socket) return;
    socket.emit("livesession:decline", { conversationId });
    setLiveSessionInvite(null);
  }, [socket, conversationId]);

  const emitTyping = useCallback(() => {
    socket?.emit("typing", { conversationId });
  }, [socket, conversationId]);

  return {
    isOnline,
    isTyping,
    liveSessionInvite,
    crisisData,
    clearCrisis: () => setCrisisData(null),
    acceptInvite,
    declineInvite,
    emitTyping,
  };
}
