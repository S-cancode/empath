export interface AnalyseRequest {
  text: string;
  userId: string;
  tier: string;
}

export interface AnalyseResult {
  primaryCategory: string;
  secondaryCategory?: string;
  subTags: string[];
  intensity: number;
  keywords: string[];
  summary: string;
}
