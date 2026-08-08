import bcrypt from "bcryptjs";
import { authenticator } from "otplib";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { config } from "../config/index.js";
import { encrypt } from "../lib/crypto.js";
import { AuthError } from "../shared/errors.js";

// Short-lived moderator sessions — least standing privilege.
const MODERATOR_SESSION_TTL = "30m";
const BCRYPT_ROUNDS = 12;

export interface ModeratorSession {
  moderatorId: string;
  role: string;
  tokenVersion: number;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

export function totpKeyUri(email: string, secret: string): string {
  return authenticator.keyuri(email, "Empath Moderation", secret);
}

function signModeratorToken(session: ModeratorSession): string {
  return jwt.sign(session, config.JWT_SECRET, { expiresIn: MODERATOR_SESSION_TTL });
}

export function verifyModeratorToken(token: string): ModeratorSession {
  try {
    return jwt.verify(token, config.JWT_SECRET) as ModeratorSession;
  } catch {
    throw new AuthError("Invalid or expired moderator session");
  }
}

async function audit(
  moderatorId: string,
  action: string,
  opts: { targetType?: string; targetId?: string; detail?: string; ip?: string } = {},
): Promise<void> {
  let ipFields = {};
  if (opts.ip) {
    const e = encrypt(opts.ip);
    ipFields = { ipCipher: e.ciphertext, ipIv: e.iv, ipAuthTag: e.authTag };
  }
  try {
    await prisma.moderatorAuditLog.create({
      data: {
        moderatorId,
        action,
        targetType: opts.targetType ?? null,
        targetId: opts.targetId ?? null,
        detail: opts.detail ?? null,
        ...ipFields,
      },
    });
  } catch (err) {
    // Audit failure must be visible but must not crash the action path.
    console.error("[moderator-audit] failed to write:", (err as Error).message);
  }
}

export const auditModeratorAction = audit;

/**
 * Verify email + password + TOTP and issue a short-lived session. Failures are
 * audited (best-effort) and always return the same generic error to avoid
 * account enumeration.
 */
export async function moderatorLogin(
  email: string,
  password: string,
  totp: string,
  ip?: string,
): Promise<{ token: string; role: string }> {
  const generic = new AuthError("Invalid credentials");
  const moderator = await prisma.moderator.findUnique({ where: { email: email.toLowerCase() } });

  if (!moderator || !moderator.active) throw generic;

  const passwordOk = await bcrypt.compare(password, moderator.passwordHash);
  const totpOk = authenticator.verify({ token: totp, secret: moderator.totpSecret });

  if (!passwordOk || !totpOk) {
    await audit(moderator.id, "login_failed", { ip, detail: !passwordOk ? "password" : "totp" });
    throw generic;
  }

  await prisma.moderator.update({
    where: { id: moderator.id },
    data: { lastLoginAt: new Date() },
  });
  await audit(moderator.id, "login", { ip });

  return {
    token: signModeratorToken({
      moderatorId: moderator.id,
      role: moderator.role,
      tokenVersion: moderator.tokenVersion,
    }),
    role: moderator.role,
  };
}

/**
 * Resolve a session token to a live, active moderator (tokenVersion match).
 * Used by the middleware so revocation (tokenVersion bump / deactivation)
 * takes effect immediately.
 */
export async function resolveModerator(token: string): Promise<ModeratorSession> {
  const session = verifyModeratorToken(token);
  const moderator = await prisma.moderator.findUnique({
    where: { id: session.moderatorId },
    select: { active: true, tokenVersion: true, role: true },
  });
  if (!moderator || !moderator.active || moderator.tokenVersion !== session.tokenVersion) {
    throw new AuthError("Moderator session revoked");
  }
  return { moderatorId: session.moderatorId, role: moderator.role, tokenVersion: moderator.tokenVersion };
}

/** Bootstrap/create a moderator. Used by the seed script and admin role. */
export async function createModerator(
  email: string,
  password: string,
  role: "moderator" | "admin" = "moderator",
): Promise<{ id: string; totpSecret: string; totpUri: string }> {
  const totpSecret = generateTotpSecret();
  const moderator = await prisma.moderator.create({
    data: {
      email: email.toLowerCase(),
      passwordHash: await hashPassword(password),
      totpSecret,
      role,
    },
  });
  return {
    id: moderator.id,
    totpSecret,
    totpUri: totpKeyUri(email, totpSecret),
  };
}
