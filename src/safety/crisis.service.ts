import { prisma } from "../lib/prisma.js";

export interface CrisisEventInput {
  userId: string;
  conversationId: string | null;
  liveSessionId?: string | null;
  triggerKeywords: string[];
  resourcesShown: string[];
}

/**
 * Persist a minimal crisis-signposting event (retained 12 months via
 * deleteExpiredCrisisEvents). Automated keyword detection deliberately does NOT
 * freeze the whole conversation: that would silently preserve all messages
 * indefinitely on a keyword match, which the privacy notice does not disclose.
 * The message content still follows the ordinary 7-day retention. Escalation by
 * a human moderator is the path that applies a bounded safeguarding hold.
 */
export async function recordCrisisEvent(input: CrisisEventInput): Promise<void> {
  await prisma.crisisEvent.create({
    data: {
      userId: input.userId,
      conversationId: input.conversationId,
      liveSessionId: input.liveSessionId ?? null,
      triggerKeywords: input.triggerKeywords,
      resourcesShown: input.resourcesShown,
    },
  });
}
