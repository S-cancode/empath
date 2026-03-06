export type Tier = "free" | "premium" | "plus";

export interface User {
  id: string;
  alias: string;
  tier: Tier;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: { id: string; alias: string };
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
}

export interface SubTag {
  id: string;
  name: string;
  premiumOnly: boolean;
  available: boolean;
}

export interface Category {
  id: string;
  name: string;
  description: string;
  subTags: SubTag[];
}

export interface MatchStatus {
  used: number;
  limit: number;
  remaining: number;
  resetsInSeconds: number;
}

export interface AnalyseResult {
  primaryCategory: string;
  secondaryCategory?: string;
  subTags: string[];
  intensity: number;
  keywords: string[];
  summary: string;
}

export interface JoinMatchPayload {
  category: string;
  subTag?: string;
  keywords?: string[];
  intensity?: number;
  matchContext?: Record<string, unknown>;
}

export interface JoinMatchResponse {
  status: "queued";
  category: string;
  matchStatus: MatchStatus;
}

export interface Conversation {
  id: string;
  partner: { id: string; anonymousAlias: string };
  category: string;
  subTag: string | null;
  matchContext?: Record<string, unknown>;
  lastMessageAt: string | null;
  hasMessages: boolean;
}

export interface Message {
  id: string;
  senderId: string;
  content: string;
  sentAt: string;
  deliveryStatus: "sent" | "delivered" | "read";
  messageType?: "text" | "voice";
  voiceDurationMs?: number;
  waveform?: number[];
}

export interface ReconnectResponse {
  status: "requested" | "reconnected";
}
