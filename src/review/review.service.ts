import { createHash, timingSafeEqual } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { config } from "../config/index.js";
import { encrypt } from "../lib/crypto.js";
import { AuthError, ForbiddenError, NotFoundError } from "../shared/errors.js";
import { buildDemoVoiceNote } from "./demo-voice.js";

/**
 * Deterministic App Review path. The reviewer signs in with their OWN Apple ID,
 * then redeems a secret access code (supplied in App Review notes) which grants
 * them — durably, server-side — an isolated, clearly-labelled scripted demo
 * conversation. This is non-circular: the server never needs to know Apple's
 * reviewer `sub` in advance. Uses the real Conversation/Message models and the
 * production authorization/moderation/report/block/delete code paths.
 *
 * Security invariants:
 *  - OFF unless REVIEW_MODE=true; every entry point re-checks it.
 *  - Access requires a durable grant (from constant-time code redemption) or an
 *    explicitly allowlisted Apple sub. Never a client flag.
 *  - The demo peer never enters the real matching queue and is isolated per
 *    reviewer via a UNIQUE reviewKey.
 *  - Provisioning is transactional and concurrency-safe (create-or-catch on the
 *    unique key); a persisted block/report is never routed around on relaunch.
 */

const DEMO_ROLE = "demo";
const DEMO_DEVICE = "review-demo-peer";
const DEMO_ALIAS = "Demo Peer (scripted, not a real person)";

const SCRIPTED_MESSAGES = [
  "Hi — I'm a scripted demo account for App Review. I am NOT a real person.",
  "You can reply with text, record a voice note (it's transcribed and safety-checked before it sends), or long-press this message to Report it.",
  "You can also Block me, and delete your account from Profile. Everything uses the real safety features.",
  "The next message is a short scripted voice note. Play it, then long-press it and choose Report — a moderator can then play back that exact note.",
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

/** Constant-time, length-independent secret comparison. */
function codeMatches(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

/**
 * Redeem the reviewer access code for the authenticated user, creating a
 * durable review grant. Idempotent. Throws a generic error on any failure and
 * never logs the code. Callers must ensure REVIEW_MODE is on; this re-checks so
 * the service can never mutate when review mode is off.
 */
export async function redeemReviewAccess(userId: string, code: unknown): Promise<void> {
  if (!isReviewModeEnabled()) {
    throw new NotFoundError("Not found");
  }
  const expected = config.REVIEW_ACCESS_CODE;
  if (
    !expected ||
    typeof code !== "string" ||
    code.length === 0 ||
    !codeMatches(code, expected)
  ) {
    // Generic — never reveals whether a code is configured or how it differs.
    throw new AuthError("Invalid review access code");
  }
  await prisma.reviewGrant.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
}

/**
 * True only if review mode is on AND this user holds a durable review grant
 * (redeemed the code) OR their persisted Apple sub is explicitly allowlisted.
 */
export async function isReviewer(userId: string): Promise<boolean> {
  if (!isReviewModeEnabled()) return false;

  const grant = await prisma.reviewGrant.findUnique({ where: { userId } });
  if (grant) return true;

  const subs = allowlistedSubs();
  if (subs.size === 0) return false;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { appleSub: true },
  });
  return !!user?.appleSub && subs.has(user.appleSub);
}

async function ensureDemoPeer(): Promise<{ id: string }> {
  // Upsert on the UNIQUE deviceId: concurrent provisioning can never create two
  // demo peers.
  return prisma.user.upsert({
    where: { deviceId: DEMO_DEVICE },
    create: {
      role: DEMO_ROLE,
      deviceId: DEMO_DEVICE,
      anonymousAlias: DEMO_ALIAS,
      ageConfirmedAt: new Date(),
      sensitiveDataConsent: true,
    },
    update: {},
    select: { id: true },
  });
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

/**
 * Idempotently return the reviewer's isolated demo conversation, creating and
 * seeding it (scripted text + one real incoming voice note) on first request.
 *
 * Safety-state preservation: if a demo conversation already exists in ANY
 * status (active, archived, or blocked after a report/block), it is returned
 * as-is. A second, active conversation is never created — so relaunch cannot
 * route around a persisted block or report.
 */
export async function ensureDemoConversation(
  reviewerId: string,
): Promise<{ conversationId: string; status: string }> {
  if (!(await isReviewer(reviewerId))) {
    throw new ForbiddenError("Review path not available");
  }

  const existing = await prisma.conversation.findUnique({
    where: { reviewKey: reviewerId },
    select: { id: true, status: true },
  });
  if (existing) return { conversationId: existing.id, status: existing.status };

  const demo = await ensureDemoPeer();

  try {
    const conversationId = await prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.create({
        data: {
          userAId: demo.id,
          userBId: reviewerId,
          category: "ai-prompt",
          status: "active",
          reviewKey: reviewerId,
          lastMessageAt: new Date(),
        },
        select: { id: true },
      });

      // Scripted, clearly-labelled text messages FROM the demo peer.
      for (const text of SCRIPTED_MESSAGES) {
        const enc = encrypt(text);
        await tx.message.create({
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

      // One real, playable, reportable incoming voice note from the demo peer.
      const voice = buildDemoVoiceNote();
      const venc = encrypt(voice.base64Audio);
      await tx.message.create({
        data: {
          conversationId: conversation.id,
          senderId: demo.id,
          content: venc.ciphertext,
          iv: venc.iv,
          authTag: venc.authTag,
          messageType: "voice",
          voiceDurationMs: voice.durationMs,
          waveform: voice.waveform,
        },
      });

      return conversation.id;
    });
    return { conversationId, status: "active" };
  } catch (err) {
    // A concurrent request won the unique reviewKey — return its conversation
    // rather than duplicating. The losing transaction rolled back cleanly.
    if (isUniqueViolation(err)) {
      const raced = await prisma.conversation.findUnique({
        where: { reviewKey: reviewerId },
        select: { id: true, status: true },
      });
      if (raced) return { conversationId: raced.id, status: raced.status };
    }
    throw err;
  }
}
