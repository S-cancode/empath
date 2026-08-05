export interface CrisisResource {
  name: string;
  url?: string;
  phone?: string;
}

export interface ClientToServerEvents {
  "conversation:join": (data: { conversationId: string }) => void;
  "conversation:message": (data: {
    conversationId: string;
    content: string;
  }) => void;
  "message:delivered": (data: { messageIds: string[] }) => void;
  "message:read": (data: {
    conversationId: string;
    upToMessageId: string;
  }) => void;
  "livesession:invite": (data: { conversationId: string }) => void;
  "livesession:accept": (data: { conversationId: string }) => void;
  "livesession:decline": (data: { conversationId: string }) => void;
  "livesession:join": (data: { liveSessionId: string }) => void;
  "livesession:message": (data: {
    liveSessionId: string;
    conversationId: string;
    content: string;
  }) => void;
  "livesession:extend": (data: { liveSessionId: string }) => void;
  "livesession:end": (data: { liveSessionId: string }) => void;
  typing: (data: { conversationId?: string; liveSessionId?: string }) => void;
  // Push suppression: tells the server which conversation is on screen so its
  // pushes are muted (see server chat.gateway push:active/push:inactive).
  "push:active": (data: { conversationId: string }) => void;
  "push:inactive": () => void;
}

export interface ServerToClientEvents {
  "conversation:joined": (data: { conversationId: string }) => void;
  "conversation:message": (data: {
    messageId: string;
    senderId: string;
    content: string;
    sentAt: string;
    originalContent?: string;
    translated?: boolean;
    sourceLanguage?: string | null;
    messageType?: string;
    voiceDurationMs?: number;
    waveform?: number[];
  }) => void;
  "message:read": (data: {
    conversationId: string;
    upToMessageId: string;
    readBy: string;
  }) => void;
  "livesession:invite": (data: {
    conversationId: string;
    inviterId: string;
  }) => void;
  "livesession:declined": (data: { conversationId: string }) => void;
  "livesession:started": (data: {
    liveSessionId: string;
    conversationId: string;
    durationMs: number;
  }) => void;
  "livesession:ended": (data: {
    reason: "timeout" | "user";
    liveSessionId: string;
  }) => void;
  "livesession:extended": (data: { liveSessionId: string }) => void;
  "livesession:extend-requested": (data: { userId: string }) => void;
  "match:online": (data: {
    conversationId: string;
    partnerId: string;
  }) => void;
  "match:offline": (data: {
    conversationId: string;
    partnerId: string;
  }) => void;
  typing: (data: { userId: string }) => void;
  "crisis:detected": (data: {
    resources: CrisisResource[];
    keywords: string[];
  }) => void;
  error: (data: { message: string }) => void;
}
