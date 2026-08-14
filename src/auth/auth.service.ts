import jwt from "jsonwebtoken";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { config } from "../config/index.js";
import { AuthError } from "../shared/errors.js";
import type { JwtPayload, RefreshTokenPayload, SubscriptionTier } from "../shared/types.js";

const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY = "7d";

export function hashDeviceId(deviceId: string): string {
  return createHash("sha256").update(deviceId).digest("hex");
}

const ALIAS_ADJECTIVES = [
  "Gentle", "Kind", "Warm", "Calm", "Brave", "Quiet", "Bright", "Soft",
  "Steady", "Tender", "Earnest", "Humble", "Patient", "Clever", "Thoughtful",
  "Curious", "Honest", "Lively", "Hopeful", "Graceful", "Sincere", "Fearless",
  "Peaceful", "Radiant", "Serene", "Noble", "Merry", "Bold", "Wise", "Swift",
  "Sunny", "Mellow",
];
const ALIAS_NOUNS = [
  "River", "Cloud", "Star", "Moon", "Leaf", "Wave", "Stone", "Light",
  "Forest", "Mountain", "Meadow", "Harbor", "Valley", "Ember", "Dawn",
  "Dusk", "Brook", "Pine", "Willow", "Comet", "Garden", "Horizon", "Spark",
  "Tide", "Feather", "Reef", "Petal", "Canyon", "Orchard", "Fjord", "Glade",
  "Lantern",
];

export function generateAlias(): string {
  const adj = ALIAS_ADJECTIVES[Math.floor(Math.random() * ALIAS_ADJECTIVES.length)];
  const noun = ALIAS_NOUNS[Math.floor(Math.random() * ALIAS_NOUNS.length)];
  const num = randomBytes(2).readUInt16BE(0) % 10_000; // 0000..9999
  return `${adj}${noun}${num.toString().padStart(4, "0")}`;
}

function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
}

function signRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, config.JWT_REFRESH_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });
}

export function verifyAccessToken(token: string): JwtPayload {
  try {
    return jwt.verify(token, config.JWT_SECRET) as JwtPayload;
  } catch {
    throw new AuthError("Invalid or expired token");
  }
}

export function issueTokens(user: {
  id: string;
  subscriptionTier: string;
  tokenVersion: number;
}): { accessToken: string; refreshToken: string } {
  return {
    accessToken: signAccessToken({
      userId: user.id,
      tier: user.subscriptionTier as SubscriptionTier,
    }),
    refreshToken: signRefreshToken({
      userId: user.id,
      tokenVersion: user.tokenVersion,
    }),
  };
}

/**
 * Kill every outstanding refresh token for a user (access tokens die within
 * 15 minutes on their own). Called by enforcement on ban/suspension and by
 * consent-withdrawal/deletion flows.
 */
export async function revokeUserSessions(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } },
  });
}

/**
 * Disposable anonymous accounts defeat durable enforcement, so they are
 * dev/test-only. Production requires Sign in with Apple unless explicitly
 * overridden via ALLOW_ANONYMOUS_AUTH=true.
 */
export function isAnonymousAuthAllowed(): boolean {
  return config.NODE_ENV !== "production" || config.ALLOW_ANONYMOUS_AUTH === true;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    return jwt.verify(token, config.JWT_REFRESH_SECRET) as RefreshTokenPayload;
  } catch {
    throw new AuthError("Invalid or expired refresh token");
  }
}

export async function createAnonymousUser(deviceId: string) {
  const hashedDeviceId = hashDeviceId(deviceId);

  let user = await prisma.user.findUnique({ where: { deviceId: hashedDeviceId } });

  if (!user) {
    user = await prisma.user.create({
      data: {
        deviceId: hashedDeviceId,
        anonymousAlias: generateAlias(),
      },
    });
  }

  return { ...issueTokens(user), user: { id: user.id, alias: user.anonymousAlias } };
}

export async function refreshTokens(refreshToken: string) {
  const payload = verifyRefreshToken(refreshToken);
  const user = await prisma.user.findUnique({ where: { id: payload.userId } });

  if (!user) {
    throw new AuthError("User not found");
  }
  if (user.tokenVersion !== payload.tokenVersion) {
    throw new AuthError("Token has been revoked");
  }

  const newAccessToken = signAccessToken({
    userId: user.id,
    tier: user.subscriptionTier as SubscriptionTier,
  });
  const newRefreshToken = signRefreshToken({
    userId: user.id,
    tokenVersion: user.tokenVersion,
  });

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
}

export async function upgradeWithEmail(userId: string, email: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { email },
  });
}
