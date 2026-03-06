const CRISIS_KEYWORDS = [
  "suicide",
  "suicidal",
  "kill myself",
  "end my life",
  "self-harm",
  "self harm",
  "cutting myself",
  "overdose",
  "hang myself",
  "jump off",
  "slit my wrists",
];

const CRISIS_PATTERNS = [
  /i\s+(just\s+)?want\s+to\s+(die|end\s+it|kill\s+myself)/i,
  /no\s+reason\s+to\s+live/i,
  /can'?t\s+go\s+on\s+(anymore|any\s+more)/i,
  /better\s+off\s+(dead|without\s+me)/i,
  /i'?m\s+going\s+to\s+(end\s+it|kill\s+myself)/i,
  /i\s+don'?t\s+want\s+to\s+(be\s+here|exist|be\s+alive)/i,
  /nobody\s+would\s+(care|miss\s+me|notice)/i,
  /planning\s+(to\s+)?(end|kill|hurt)\s+(it|myself)/i,
  /thought(s)?\s+(about|of)\s+(suicide|killing\s+myself|ending\s+(it|my\s+life))/i,
];

export interface CrisisDetectionResult {
  detected: boolean;
  matchedKeywords: string[];
}

export function detectCrisis(text: string): CrisisDetectionResult {
  const lowerText = text.toLowerCase();
  const matchedKeywords: string[] = [];

  // Check keywords
  for (const keyword of CRISIS_KEYWORDS) {
    if (lowerText.includes(keyword)) {
      matchedKeywords.push(keyword);
    }
  }

  // Check patterns
  for (const pattern of CRISIS_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      matchedKeywords.push(match[0]);
    }
  }

  return {
    detected: matchedKeywords.length > 0,
    matchedKeywords: [...new Set(matchedKeywords)],
  };
}
