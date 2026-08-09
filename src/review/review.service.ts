import { prisma } from "../lib/prisma.js";
import { config } from "../config/index.js";
import { encrypt } from "../lib/crypto.js";
import { ForbiddenError } from "../shared/errors.js";

/**
 * Deterministic App Review path. A specifically-allowlisted reviewer account
 * (by Apple sub, server-side) can obtain an isolated, clearly-labelled scripted
 * demo conversation so Apple can review the full flow without waiting for a
 * live peer. Uses the real Conversation/Message models and production
 * authorization/moderation/report/block/delete code paths.
 *
 * Security: OFF unless REVIEW_MODE=true; restricted to REVIEW_APPLE_SUBS; the
 * demo peer never enters the real matching queue; no public/unauthenticated
 * seed endpoint; idempotent.
 */

const DEMO_ROLE = "demo";
const DEMO_DEVICE = "review-demo-peer";
const DEMO_ALIAS = "Demo Peer (scripted, not a real person)";

const SCRIPTED_MESSAGES = [
  "Hi — I'm a scripted demo account for App Review. I am NOT a real person.",
  "You can reply with text, record a voice note (it's transcribed and safety-checked before it sends), or long-press this message to Report it.",
  "You can also Block me, and delete your account from Profile. Everything uses the real safety features.",
];

export function isReviewModeEnabled(): boolean {
  return config.REVIEW_MODE === true;
}

function allowlistedSubs(): Set<string> {
  return new Set(
    (config.REVIEW_APPLE_SUBS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/** True only if review mode is on AND this user's Apple sub is allowlisted. */
export async function isReviewer(userId: string): Promise<boolean> {
  if (!isReviewModeEnabled()) return false;
  const subs = allowlistedSubs();
  if (subs.size === 0) return false;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { appleSub: true },
  });
  return !!user?.appleSub && subs.has(user.appleSub);
}

async function ensureDemoPeer(): Promise<{ id: string }> {
  const existing = await prisma.user.findFirst({ where: { role: DEMO_ROLE } });
  if (existing) return { id: existing.id };
  return prisma.user.create({
    data: {
      role: DEMO_ROLE,
      deviceId: DEMO_DEVICE,
      anonymousAlias: DEMO_ALIAS,
      ageConfirmedAt: new Date(),
      sensitiveDataConsent: true,
    },
    select: { id: true },
  });
}

/**
 * Idempotently return the reviewer's isolated demo conversation, creating and
 * seeding it (scripted, labelled messages) on first request. Guarded: caller
 * must have passed isReviewer().
 */
export async function ensureDemoConversation(reviewerId: string): Promise<{ conversationId: string }> {
  if (!(await isReviewer(reviewerId))) {
    throw new ForbiddenError("Review path not available");
  }
  const demo = await ensureDemoPeer();

  const existing = await prisma.conversation.findFirst({
    where: {
      status: { in: ["active", "archived"] },
      OR: [
        { userAId: reviewerId, userBId: demo.id },
        { userAId: demo.id, userBId: reviewerId },
      ],
    },
    select: { id: true },
  });
  if (existing) return { conversationId: existing.id };

  const conversation = await prisma.conversation.create({
    data: {
      userAId: demo.id,
      userBId: reviewerId,
      category: "ai-prompt",
      status: "active",
      lastMessageAt: new Date(),
    },
    select: { id: true },
  });

  // Seed the scripted, clearly-labelled messages FROM the demo peer.
  for (const text of SCRIPTED_MESSAGES) {
    const enc = encrypt(text);
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: demo.id,
        content: enc.ciphertext,
        iv: enc.iv,
        authTag: enc.authTag,
        messageType: "text",
      },
    });
  }

  return { conversationId: conversation.id };
}
