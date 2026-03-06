import { useEffect, useState, useCallback, useRef } from "react";
import { useSocket } from "@/providers/SocketProvider";
import { useSocketEvent } from "./useSocketEvent";
import { useAuthStore } from "@/stores/auth.store";
import type { CrisisResource } from "@/types/socket";

interface LiveMessage {
  senderId: string;
  content: string;
  sentAt: string;
}

interface CrisisData {
  resources: CrisisResource[];
  keywords: string[];
}

export function useLiveSession(
  liveSessionId: string,
  conversationId: string,
  durationMs: number
) {
  const { socket } = useSocket();
  const userId = useAuthStore((s) => s.user?.id);
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [timeRemaining, setTimeRemaining] = useState(durationMs);
  const [isEnded, setIsEnded] = useState(false);
  const [extendRequested, setExtendRequested] = useState(false);
  const [crisisData, setCrisisData] = useState<CrisisData | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);

  // Join live session room
  useEffect(() => {
    if (!socket || !liveSessionId) return;
    socket.emit("livesession:join", { liveSessionId });
  }, [socket, liveSessionId]);

  // Countdown timer
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1000) {
          clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1000;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  // Incoming live messages
  useSocketEvent<LiveMessage>("livesession:message", (data) => {
    if (data.senderId === userId) return;
    setMessages((prev) => [...prev, data]);
  });

  // Session ended
  useSocketEvent<{ reason: "timeout" | "user"; liveSessionId: string }>(
    "livesession:ended",
    (data) => {
      if (data.liveSessionId === liveSessionId) {
        setIsEnded(true);
        clearInterval(timerRef.current);
      }
    }
  );

  // Session extended
  useSocketEvent<{ liveSessionId: string }>("livesession:extended", (data) => {
    if (data.liveSessionId === liveSessionId) {
      setTimeRemaining((prev) => prev + 10 * 60 * 1000);
      setExtendRequested(false);
    }
  });

  // Partner requested extension
  useSocketEvent<{ userId: string }>("livesession:extend-requested", () => {
    setExtendRequested(true);
  });

  // Crisis
  useSocketEvent<CrisisData>("crisis:detected", setCrisisData);

  const sendMessage = useCallback(
    (content: string) => {
      if (!socket) return;
      socket.emit("livesession:message", {
        liveSessionId,
        conversationId,
        content,
      });
      setMessages((prev) => [
        ...prev,
        { senderId: userId!, content, sentAt: new Date().toISOString() },
      ]);
    },
    [socket, liveSessionId, conversationId, userId]
  );

  const requestExtend = useCallback(() => {
    socket?.emit("livesession:extend", { liveSessionId });
  }, [socket, liveSessionId]);

  const endSession = useCallback(() => {
    socket?.emit("livesession:end", { liveSessionId });
  }, [socket, liveSessionId]);

  return {
    messages,
    timeRemaining,
    isEnded,
    extendRequested,
    crisisData,
    clearCrisis: () => setCrisisData(null),
    sendMessage,
    requestExtend,
    endSession,
  };
}
