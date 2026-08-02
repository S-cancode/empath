import { prisma } from "../lib/prisma.js";
import { setRetentionHold } from "../conversation/conversation.service.js";

export interface CrisisEventInput {
  userId: string;
  conversationId: string | null;
  liveSessionId?: string | null;
  triggerKeywords: string[];
  resourcesShown: string[];
}

/**
 * Persist a crisis event and place a retention hold on the conversation so
 * the record survives the retention worker. Without the hold, a crisis-flagged
 * conversation with no attached report would be deleted after 7 days.
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

  if (input.conversationId) {
    await setRetentionHold(input.conversationId);
  }
}
