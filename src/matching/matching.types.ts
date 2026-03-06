export interface MatchRequest {
  userId: string;
  category: string;
  subTag?: string;
  tier: string;
  joinedAt: number;
  keywords?: string[];
  intensity?: number;
  matchContext?: Record<string, unknown>;
}

export interface MatchResult {
  conversationId: string;
  userAId: string;
  userBId: string;
  category: string;
  subTag?: string;
}
