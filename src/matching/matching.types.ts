export interface MatchRequest {
  userId: string;
  category: string;
  subTag?: string;
  tier: string;
  joinedAt: number;
  keywords?: string[];
  matchContext?: Record<string, unknown>;
  embedding?: number[];
}

export interface MatchResult {
  conversationId: string;
  userAId: string;
  userBId: string;
  category: string;
  subTag?: string;
}
