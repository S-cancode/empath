export interface AnalyseRequest {
  text: string;
  userId: string;
  tier: string;
}

export interface AnalyseResult {
  primaryCategory: string;
  secondaryCategory?: string;
  subTags: string[];
  keywords: string[];
  summary: string;
  embedding?: number[];
}
