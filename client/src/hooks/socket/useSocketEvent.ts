import { useEffect, useRef } from "react";
import { useSocket } from "@/providers/SocketProvider";

export function useSocketEvent<T = unknown>(
  event: string,
  handler: (data: T) => void
): void {
  const { socket } = useSocket();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!socket) return;
    const listener = (data: T) => handlerRef.current(data);
    socket.on(event as any, listener as any);
    return () => {
      socket.off(event as any, listener as any);
    };
  }, [socket, event]);
}
