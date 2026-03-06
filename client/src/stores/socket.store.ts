import { create } from "zustand";

type SocketStatus = "disconnected" | "connecting" | "connected" | "error";

interface SocketState {
  status: SocketStatus;
  socketId: string | null;
  lastError: string | null;

  setStatus: (status: SocketStatus) => void;
  setSocketId: (id: string | null) => void;
  setError: (err: string | null) => void;
}

export const useSocketStore = create<SocketState>((set) => ({
  status: "disconnected",
  socketId: null,
  lastError: null,

  setStatus: (status) => set({ status }),
  setSocketId: (socketId) => set({ socketId }),
  setError: (lastError) => set({ lastError }),
}));
