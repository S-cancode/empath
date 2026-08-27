import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { encrypt } from "../lib/crypto.js";
import { createHash } from "node:crypto";
import { ValidationError, NotFoundError } from "../shared/errors.js";
import { revokeUserSessions } from "../auth/auth.service.js";
import { disconnectUserSockets } from "../safety/enforcement.service.js";
import { evictFromMatching } from "../matching/matching.service.js";
import { invalidateComplianceCache } from "./compliance-gate.service.js";
import {
  decryptAppleRefreshToken,
  revokeRefreshToken,
  isAppleServerConfigured,
} from "../auth/apple-tokens.js";

export type AppleRevocationOutcome = "revoked" | "failed" | "unavailable" | "not_applicable";

// --- Text versioning ---

export async function upsertTermsVersion(
  version: string,
  content: string,
  effectiveFrom: Date,
): Promise<void> {
  await prisma.termsVersion.upsert({
    where: { version },
    create: { version, content, effectiveFrom },
    update: { content, effectiveFrom },
  });
}

export async function upsertConsentTextVersion(
  version: string,
  consentType: string,
  content: string,
  effectiveFrom: Date,
): Promise<void> {
  const textHash = createHash("sha256").update(content).digest("hex");
  await prisma.consentTextVersion.upsert({
    where: { version },
    create: { version, consentType, content, textHash, effectiveFrom },
    update: { consentType, content, textHash, effectiveFrom },
  });
}

export async function confirmAge(
  userId: string,
  dateOfBirth: string,
): Promise<{ confirmed: boolean }> {
  const dob = new Date(dateOfBirth);
  if (isNaN(dob.getTime())) {
    throw new ValidationError("Invalid date of birth");
  }

  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }

  if (age < 13) {
    // Do NOT store DOB for under-13s per UK Children's Code
    return { confirmed: false };
  }

  if (age < 18) {
    return { confirmed: false };
  }

  // Data minimisation: only store DOB for identified users (those with email).
  // Anonymous users get only the confirmation flag and timestamp.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });

  await prisma.user.update({
    where: { id: userId },
    data: {
      dateOfBirth: user?.email ? dob : undefined,
      ageConfirmedAt: new Date(),
    },
  });

  return { confirmed: true };
}

export async function acceptTerms(
  userId: string,
  termsVersion: string,
  ip: string | undefined,
  appVersion: string | undefined,
): Promise<{ id: string }> {
  let ipCipher: string | null = null;
  let ipIv: string | null = null;
  let ipAuthTag: string | null = null;

  if (ip) {
    const encrypted = encrypt(ip);
    ipCipher = encrypted.ciphertext;
    ipIv = encrypted.iv;
    ipAuthTag = encrypted.authTag;
  }

  const record = await prisma.termsAcceptance.create({
    data: { userId, termsVersion, ipCipher, ipIv, ipAuthTag, appVersion },
  });

  return { id: record.id };
}

export async function hasAcceptedTerms(
  userId: string,
  termsVersion: string,
): Promise<boolean> {
  const record = await prisma.termsAcceptance.findFirst({
    where: { userId, termsVersion },
  });
  return !!record;
}

export async function recordConsent(
  userId: string,
  params: {
    consentType: string;
    version: string;
    granted: boolean;
    textHash: string;
    ip?: string;
    appVersion?: string;
    deviceType?: string;
  },
): Promise<{ id: string }> {
  let ipCipher: string | null = null;
  let ipIv: string | null = null;
  let ipAuthTag: string | null = null;

  if (params.ip) {
    const encrypted = encrypt(params.ip);
    ipCipher = encrypted.ciphertext;
    ipIv = encrypted.iv;
    ipAuthTag = encrypted.authTag;
  }

  const record = await prisma.consentRecord.create({
    data: {
      userId,
      consentType: params.consentType,
      consentVersion: params.version,
      granted: params.granted,
      textHash: params.textHash,
      ipCipher,
      ipIv,
      ipAuthTag,
      appVersion: params.appVersion ?? null,
      deviceType: params.deviceType ?? null,
    },
  });

  if (params.consentType === "sensitive_data") {
    await prisma.user.update({
      where: { id: userId },
      data: {
        sensitiveDataConsent: params.granted,
        consentWithdrawnAt: params.granted ? null : new Date(),
      },
    });
  }

  return { id: record.id };
}

export async function withdrawConsent(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      sensitiveDataConsent: false,
      consentWithdrawnAt: new Date(),
    },
  });

  // Update the latest consent record with withdrawal timestamp
  const latestConsent = await prisma.consentRecord.findFirst({
    where: { userId, consentType: "sensitive_data", granted: true, withdrawnAt: null },
    orderBy: { recordedAt: "desc" },
  });

  if (latestConsent) {
    await prisma.consentRecord.update({
      where: { id: latestConsent.id },
      data: { withdrawnAt: new Date() },
    });
  }

  // Withdrawal must take effect immediately, not at next request: kill
  // sessions and sockets, leave the matching queue, cancel proposals.
  await complianceRevocationCascade(userId);
}

/**
 * Shared cascade for compliance-invalidating transitions (consent
 * withdrawal, account deletion; enforcement runs its own equivalent).
 * Order: sessions die, matching state goes, cache clears, sockets drop —
 * so an already-open client is rejected on its next action.
 */
export async function complianceRevocationCascade(userId: string): Promise<void> {
  await revokeUserSessions(userId);
  await evictFromMatching(userId);
  invalidateComplianceCache(userId);
  disconnectUserSockets(userId);
}

/**
 * Server-side check for a granted, unwithdrawn translation consent. Gate for
 * enabling auto-translate — never trust client-side consent logging alone.
 */
export async function hasTranslationConsent(userId: string): Promise<boolean> {
  const record = await prisma.consentRecord.findFirst({
    where: { userId, consentType: "translation", granted: true, withdrawnAt: null },
  });
  return !!record;
}

export async function hasValidConsent(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { sensitiveDataConsent: true },
  });
  return user?.sensitiveDataConsent ?? false;
}

// --- Retention cleanup functions (called by retention worker) ---

/** Delete crisis events older than 12 months */
export async function deleteExpiredCrisisEvents(): Promise<number> {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 12);

  const result = await prisma.crisisEvent.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return result.count;
}

/** Delete resolved reports older than 12 months from resolution */
export async function deleteExpiredReports(): Promise<number> {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 12);

  // First delete moderation actions for expired reports
  await prisma.moderationAction.deleteMany({
    where: {
      report: {
        resolvedAt: { not: null, lt: cutoff },
      },
    },
  });

  const result = await prisma.report.deleteMany({
    where: {
      resolvedAt: { not: null, lt: cutoff },
    },
  });
  return result.count;
}

/** Delete terms acceptance records 2 years after account deletion */
export async function deleteExpiredTermsRecords(): Promise<number> {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 2);

  const result = await prisma.termsAcceptance.deleteMany({
    where: {
      user: {
        deletedAt: { not: null, lt: cutoff },
      },
    },
  });
  return result.count;
}

/** Delete consent records 6 years after account deletion */
export async function deleteExpiredConsentRecords(): Promise<number> {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 6);

  const result = await prisma.consentRecord.deleteMany({
    where: {
      user: {
        deletedAt: { not: null, lt: cutoff },
      },
    },
  });
  return result.count;
}

// --- Complaints ---

export async function submitComplaint(
  userId: string,
  subject: string,
  description: string,
): Promise<{ id: string }> {
  const complaint = await prisma.complaint.create({
    data: { userId, subject, description },
  });
  return { id: complaint.id };
}

export async function getComplaintsForUser(userId: string) {
  return prisma.complaint.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

/** Delete resolved complaints older than 12 months from resolution */
export async function deleteExpiredComplaints(): Promise<number> {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 12);

  const result = await prisma.complaint.deleteMany({
    where: {
      resolvedAt: { not: null, lt: cutoff },
    },
  });
  return result.count;
}

/** DSAR data export — returns all personal data held for a user */
export async function exportUserData(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      anonymousAlias: true,
      email: true,
      subscriptionTier: true,
      dateOfBirth: true,
      ageConfirmedAt: true,
      sensitiveDataConsent: true,
      consentWithdrawnAt: true,
      createdAt: true,
      lastActiveAt: true,
    },
  });
  if (!user) throw new NotFoundError("User not found");

  const conversations = await prisma.conversation.findMany({
    where: { OR: [{ userAId: userId }, { userBId: userId }] },
    select: { id: true, category: true, subTag: true, status: true, createdAt: true, lastMessageAt: true },
  });

  const messages = await prisma.message.findMany({
    where: { senderId: userId },
    select: { id: true, conversationId: true, sentAt: true, messageType: true, voiceDurationMs: true },
    orderBy: { sentAt: "desc" },
  });

  const termsAcceptances = await prisma.termsAcceptance.findMany({
    where: { userId },
    select: { termsVersion: true, acceptedAt: true, appVersion: true },
  });

  const consentRecords = await prisma.consentRecord.findMany({
    where: { userId },
    select: { consentType: true, consentVersion: true, granted: true, recordedAt: true, withdrawnAt: true },
  });

  const reports = await prisma.report.findMany({
    where: { reporterId: userId },
    select: { id: true, reason: true, status: true, createdAt: true },
  });

  const complaints = await prisma.complaint.findMany({
    where: { userId },
    select: { id: true, subject: true, status: true, createdAt: true, resolvedAt: true },
  });

  const crisisEvents = await prisma.crisisEvent.findMany({
    where: { userId },
    select: { id: true, triggerKeywords: true, createdAt: true },
  });

  const blocks = await prisma.blockedUser.findMany({
    where: { userId },
    select: { blockedUserId: true, createdAt: true },
  });

  return {
    exportedAt: new Date().toISOString(),
    user,
    conversations,
    messagesSent: messages.length,
    messagesNote: "Message content is encrypted at rest and auto-deleted after 7 days. Content is not included in this export.",
    termsAcceptances,
    consentRecords,
    reportsFiled: reports,
    complaints,
    crisisEvents,
    blockedUsers: blocks,
  };
}

export async function deleteAccount(
  userId: string,
): Promise<{ appleRevocation: AppleRevocationOutcome }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError("User not found");

  // Explicit ordering (Apple TN3194): attempt Apple token revocation FIRST,
  // using the token captured before erasure, THEN erase locally. Local erasure
  // must proceed regardless of Apple availability — right to erasure (Art. 17)
  // cannot be blocked by a third party. The outcome is reported truthfully so
  // the client can show manual-revocation guidance when needed.
  let appleRevocation: AppleRevocationOutcome = "not_applicable";
  // Decryption can throw (bad auth tag, rotated ENCRYPTION_KEY, corrupt
  // ciphertext). Erasure must NEVER be blocked by that — fall back to
  // "unavailable" (manual guidance) and continue.
  let appleRefreshToken: string | null = null;
  try {
    appleRefreshToken = decryptAppleRefreshToken(user);
  } catch (err) {
    console.error("[apple] could not read stored token during deletion:", (err as Error).message);
    appleRefreshToken = null;
  }
  if (appleRefreshToken && isAppleServerConfigured()) {
    try {
      await revokeRefreshToken(appleRefreshToken);
      appleRevocation = "revoked";
    } catch (err) {
      // Transient/permanent Apple failure — observable, no secret exposed.
      appleRevocation = "failed";
      console.error("[apple] token revocation failed during account deletion:", (err as Error).message);
    }
  } else if (user.appleSub) {
    // Legacy account (signed in before token storage) or server unconfigured:
    // we cannot revoke programmatically → the client shows manual steps.
    appleRevocation = "unavailable";
  }

  await prisma.$transaction(async (tx) => {
    await tx.message.deleteMany({ where: { senderId: userId } });
    await tx.rating.deleteMany({ where: { raterId: userId } });
    await tx.crisisEvent.deleteMany({ where: { userId } });

    // Clear any residual encrypted raw-prompt payloads and match context
    // for conversations this user participated in (PII cleanup).
    await tx.conversation.updateMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
      data: {
        rawPromptCipher: null,
        rawPromptIv: null,
        rawPromptAuthTag: null,
        matchContext: Prisma.JsonNull,
      },
    });

    // Archive any still-active conversations (keep archived/blocked as-is for partner context)
    await tx.conversation.updateMany({
      where: { status: "active", OR: [{ userAId: userId }, { userBId: userId }] },
      data: { status: "archived" },
    });

    await tx.blockedUser.deleteMany({ where: { userId } });
    await tx.complaint.deleteMany({ where: { userId } });

    await tx.$executeRawUnsafe(
      `DELETE FROM match_queue_entries WHERE user_id = $1`,
      userId,
    );

    await tx.user.update({
      where: { id: userId },
      data: {
        email: null,
        anonymousAlias: "deleted-user",
        deviceId: `deleted-${userId}`,
        appleSub: null,
        appleRefreshTokenCipher: null,
        appleRefreshTokenIv: null,
        appleRefreshTokenAuthTag: null,
        pushToken: null,
        dateOfBirth: null,
        deletedAt: new Date(),
        tokenVersion: { increment: 1 },
      },
    });
  });

  await complianceRevocationCascade(userId);
  return { appleRevocation };
}
