import { create } from "zustand";
import type { Tier, User } from "@/types/api";
import {
  getAccessToken,
  getRefreshToken,
  setTokens as storeTokens,
  clearTokens,
} from "@/lib/secure-storage";

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
  isHydrated: boolean;

  setTokens: (accessToken: string, refreshToken: string) => void;
  setUser: (user: User) => void;
  hydrate: () => Promise<void>;
  logout: () => Promise<void>;
}

function decodeJwt(token: string): { userId: string; tier: Tier } {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return { userId: payload.userId ?? "", tier: payload.tier ?? "free" };
  } catch {
    return { userId: "", tier: "free" };
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: null,
  refreshToken: null,
  user: null,
  isHydrated: false,

  setTokens: (accessToken, refreshToken) => {
    const current = get().user;
    const { userId, tier } = decodeJwt(accessToken);
    set({
      accessToken,
      refreshToken,
      user: current ? { ...current, id: userId, tier } : current,
    });
  },

  setUser: (user) => set({ user }),

  hydrate: async () => {
    const accessToken = await getAccessToken();
    const refreshToken = await getRefreshToken();
    if (accessToken && refreshToken) {
      const { userId, tier } = decodeJwt(accessToken);
      set({ accessToken, refreshToken, user: { id: userId, alias: "", tier }, isHydrated: true });
    } else {
      set({ isHydrated: true });
    }
  },

  logout: async () => {
    await clearTokens();
    set({ accessToken: null, refreshToken: null, user: null });
  },
}));
