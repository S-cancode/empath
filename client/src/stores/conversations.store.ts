import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";

const NICKNAMES_KEY = "empath:nicknames";

interface OptimisticMessage {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  sentAt: string;
  deliveryStatus: "sending" | "sent" | "delivered" | "read";
  isOptimistic: boolean;
}

interface ConversationsState {
  optimisticMessages: Record<string, OptimisticMessage[]>;
  presence: Record<string, boolean>;
  typing: Record<string, boolean>;
  unreadCounts: Record<string, number>;
  nicknames: Record<string, string>;
  activeConversationId: string | null;

  addOptimisticMessage: (msg: OptimisticMessage) => void;
  confirmMessage: (
    tempId: string,
    realId: string,
    conversationId: string
  ) => void;
  failMessage: (tempId: string, conversationId: string) => void;
  receiveMessage: (msg: OptimisticMessage) => void;
  setPresence: (conversationId: string, isOnline: boolean) => void;
  setTyping: (conversationId: string, isTyping: boolean) => void;
  incrementUnread: (conversationId: string) => void;
  clearUnread: (conversationId: string) => void;
  setActiveConversation: (conversationId: string | null) => void;
  setNickname: (conversationId: string, name: string) => void;
  loadNicknames: () => Promise<void>;
}

export const useConversationsStore = create<ConversationsState>((set, get) => ({
  optimisticMessages: {},
  presence: {},
  typing: {},
  unreadCounts: {},
  nicknames: {},
  activeConversationId: null,

  addOptimisticMessage: (msg) =>
    set((state) => ({
      optimisticMessages: {
        ...state.optimisticMessages,
        [msg.conversationId]: [
          ...(state.optimisticMessages[msg.conversationId] ?? []),
          msg,
        ],
      },
    })),

  confirmMessage: (tempId, realId, conversationId) =>
    set((state) => ({
      optimisticMessages: {
        ...state.optimisticMessages,
        [conversationId]: (
          state.optimisticMessages[conversationId] ?? []
        ).map((m) =>
          m.id === tempId
            ? { ...m, id: realId, isOptimistic: false, deliveryStatus: "sent" as const }
            : m
        ),
      },
    })),

  failMessage: (tempId, conversationId) =>
    set((state) => ({
      optimisticMessages: {
        ...state.optimisticMessages,
        [conversationId]: (
          state.optimisticMessages[conversationId] ?? []
        ).filter((m) => m.id !== tempId),
      },
    })),

  receiveMessage: (msg) =>
    set((state) => ({
      optimisticMessages: {
        ...state.optimisticMessages,
        [msg.conversationId]: [
          ...(state.optimisticMessages[msg.conversationId] ?? []),
          msg,
        ],
      },
    })),

  setPresence: (conversationId, isOnline) =>
    set((state) => ({
      presence: { ...state.presence, [conversationId]: isOnline },
    })),

  setTyping: (conversationId, isTyping) =>
    set((state) => ({
      typing: { ...state.typing, [conversationId]: isTyping },
    })),

  incrementUnread: (conversationId) =>
    set((state) => ({
      unreadCounts: {
        ...state.unreadCounts,
        [conversationId]: (state.unreadCounts[conversationId] ?? 0) + 1,
      },
    })),

  clearUnread: (conversationId) =>
    set((state) => ({
      unreadCounts: { ...state.unreadCounts, [conversationId]: 0 },
    })),

  setActiveConversation: (conversationId) =>
    set({ activeConversationId: conversationId }),

  setNickname: (conversationId, name) => {
    set((state) => {
      const updated = { ...state.nicknames, [conversationId]: name };
      AsyncStorage.setItem(NICKNAMES_KEY, JSON.stringify(updated));
      return { nicknames: updated };
    });
  },

  loadNicknames: async () => {
    try {
      const raw = await AsyncStorage.getItem(NICKNAMES_KEY);
      if (raw) set({ nicknames: JSON.parse(raw) });
    } catch {}
  },
}));
