import OpenAI from "openai";
import { config } from "../config/index.js";

/**
 * Pre-delivery content moderation. Runs after authorization + compliance and
 * BEFORE persistence/delivery. Blocks outward-directed harmful content
 * (threats, harassment, hate, sexual, scams, illegal, self-harm ENCOURAGEMENT,
 * dangerous medical instructions). Distinct from crisis detection: a sender
 * expressing their OWN distress is never blocked — that path shows resources.
 *
 * Fail-closed: if the classifier is unavailable or times out, the message is
 * quarantined (not delivered), never silently passed.
 */

const STUB_KEY = "sk-stub-placeholder-key";
const MODERATION_MODEL = "omni-moderation-latest";
const TIMEOUT_MS = 4000;

export type ModerationAction = "allow" | "block" | "quarantine";

export interface ModerationResult {
  action: ModerationAction;
  allowed: boolean;
  categories: string[];
}

// Self-directed distress is support, not a violation. These categories alone
// never block a send (crisis detection handles them).
const SELF_DIRECTED_ONLY = new Set([
  "self-harm",
  "self-harm/intent",
]);

function isStubMode(): boolean {
  return !config.OPENAI_API_KEY || config.OPENAI_API_KEY === STUB_KEY;
}

/** Local last-resort heuristic: obvious outward threats/abuse only. */
const OUTWARD_ABUSE_PATTERNS: RegExp[] = [
  /\bkill\s+your\s*self\b/i,
  /\bkys\b/i,
  /\byou('?re| are)\s+(worthless|trash|garbage|nothing|pathetic)\b/i,
  /\b(i('?ll| will)|gonna)\s+(find|hurt|kill|end)\s+you\b/i,
  /\bgo\s+(die|kill\s+yourself)\b/i,
];

function heuristicModerate(text: string): ModerationResult {
  for (const re of OUTWARD_ABUSE_PATTERNS) {
    if (re.test(text)) {
      return { action: "block", allowed: false, categories: ["harassment"] };
    }
  }
  return { action: "allow", allowed: true, categories: [] };
}

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: config.OPENAI_API_KEY, baseURL: config.OPENAI_BASE_URL });
  }
  return client;
}

export async function moderateText(text: string): Promise<ModerationResult> {
  if (!text || text.trim().length === 0) {
    return { action: "allow", allowed: true, categories: [] };
  }

  if (isStubMode()) {
    return heuristicModerate(text);
  }

  try {
    const response = (await Promise.race([
      getClient().moderations.create({ model: MODERATION_MODEL, input: text }),
      new Promise((_res, rej) => setTimeout(() => rej(new Error("moderation timeout")), TIMEOUT_MS)),
    ])) as { results: Array<{ flagged: boolean; categories: Record<string, boolean> }> };

    const result = response.results?.[0];
    if (!result) throw new Error("empty moderation response");

    if (!result.flagged) {
      return { action: "allow", allowed: true, categories: [] };
    }

    const flaggedCategories = Object.entries(result.categories)
      .filter(([, v]) => v === true)
      .map(([k]) => k);

    // If the ONLY flagged categories are self-directed distress, allow —
    // crisis detection covers this; blocking would punish a vulnerable user.
    const blockingCategories = flaggedCategories.filter((c) => !SELF_DIRECTED_ONLY.has(c));
    if (blockingCategories.length === 0) {
      return { action: "allow", allowed: true, categories: [] };
    }

    return { action: "block", allowed: false, categories: blockingCategories };
  } catch (err) {
    // Never leak message content into logs.
    console.error("[moderation] classifier unavailable — quarantining:", (err as Error).message);
    return { action: "quarantine", allowed: false, categories: [] };
  }
}
