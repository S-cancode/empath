import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  type PropsWithChildren,
} from "react";
import { io, type Socket } from "socket.io-client";
import { useAuthStore } from "@/stores/auth.store";
import { useSocketStore } from "@/stores/socket.store";
import type { ClientToServerEvents, ServerToClientEvents } from "@/types/socket";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface SocketContextValue {
  socket: TypedSocket | null;
}

const SocketContext = createContext<SocketContextValue>({ socket: null });

export function useSocket() {
  return useContext(SocketContext);
}

export function SocketProvider({ children }: PropsWithChildren) {
  const [socket, setSocket] = useState<TypedSocket | null>(null);
  const socketRef = useRef<TypedSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accessToken = useAuthStore((s) => s.accessToken);
  const { setStatus, setSocketId, setError } = useSocketStore();

  useEffect(() => {
    if (!accessToken) {
      if (reconnectTimer.current) { clearTimeout(reconnectTimer.current); reconnectTimer.current = null; }
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null);
        setStatus("disconnected");
        setSocketId(null);
      }
      return;
    }

    if (socketRef.current) {
      // Update token and force reconnect with new credentials (debounced)
      socketRef.current.auth = { token: accessToken };
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      reconnectTimer.current = setTimeout(() => {
        reconnectTimer.current = null;
        socketRef.current?.disconnect();
        socketRef.current?.connect();
      }, 100);
      return;
    }

    const s: TypedSocket = io(API_URL, {
      auth: { token: accessToken },
      autoConnect: true,
      transports: ["websocket"],
    });

    s.on("connect", () => {
      setStatus("connected");
      setSocketId(s.id ?? null);
      setError(null);
    });

    s.on("disconnect", () => {
      setStatus("disconnected");
      setSocketId(null);
    });

    s.on("connect_error", (err) => {
      setStatus("error");
      setError(err.message);
    });

    socketRef.current = s;
    setSocket(s);
    setStatus("connecting");

    return () => {
      s.disconnect();
      socketRef.current = null;
      setSocket(null);
      setStatus("disconnected");
    };
  }, [accessToken, setStatus, setSocketId, setError]);

  return (
    <SocketContext.Provider value={{ socket }}>
      {children}
    </SocketContext.Provider>
  );
}
