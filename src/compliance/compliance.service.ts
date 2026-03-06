import { prisma } from "../lib/prisma.js";
import { encrypt } from "../lib/crypto.js";
import { ValidationError, NotFoundError } from "../shared/errors.js";

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

  await prisma.user.update({
    where: { id: userId },
    data: { dateOfBirth: dob, ageConfirmedAt: new Date() },
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

  // Anonymise reports where user is the reporter (keep for moderation)
  // We can't truly anonymise with a FK constraint, so we keep the reporter ID
  // but the user record will be soft-deleted

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
