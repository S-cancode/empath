import { prisma } from "../lib/prisma.js";
import { encrypt } from "../lib/crypto.js";
import { createHash } from "node:crypto";
import { ValidationError, NotFoundError } from "../shared/errors.js";

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

export async function deleteAccount(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError("User not found");

  // Delete messages sent by this user
  await prisma.message.deleteMany({ where: { senderId: userId } });

  // Delete messages in conversations where this user is a participant
  await prisma.message.deleteMany({
    where: {
      conversation: {
        OR: [{ userAId: userId }, { userBId: userId }],
      },
    },
  });

  // Delete ratings
  await prisma.rating.deleteMany({ where: { raterId: userId } });

  // Delete crisis events
  await prisma.crisisEvent.deleteMany({ where: { userId } });

  // Delete live sessions in user's conversations
  await prisma.liveSession.deleteMany({
    where: {
      conversation: {
        OR: [{ userAId: userId }, { userBId: userId }],
      },
    },
  });

  // Delete conversations
  await prisma.conversation.deleteMany({
    where: { OR: [{ userAId: userId }, { userBId: userId }] },
  });

  // Delete blocks where user is the blocker
  await prisma.blockedUser.deleteMany({ where: { userId } });

  // Delete complaints submitted by this user
  await prisma.complaint.deleteMany({ where: { userId } });

  // Remove from match queue if present
  await prisma.$executeRawUnsafe(
    `DELETE FROM match_queue_entries WHERE user_id = $1`,
    userId,
  );

  // Soft-delete the user: nullify PII, keep record for retention periods
  await prisma.user.update({
    where: { id: userId },
    data: {
      email: null,
      anonymousAlias: "deleted-user",
      deviceId: `deleted-${userId}`,
      pushToken: null,
      dateOfBirth: null,
      deletedAt: new Date(),
      tokenVersion: { increment: 1 }, // Invalidate all tokens
    },
  });
}
