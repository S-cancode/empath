import jwt from "jsonwebtoken";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { config } from "../config/index.js";
import { AuthError } from "../shared/errors.js";
import type { JwtPayload, RefreshTokenPayload, SubscriptionTier } from "../shared/types.js";

const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY = "7d";

function hashDeviceId(deviceId: string): string {
  return createHash("sha256").update(deviceId).digest("hex");
}

function generateAlias(): string {
  const adjectives = ["Gentle", "Kind", "Warm", "Calm", "Brave", "Quiet", "Bright", "Soft"];
  const nouns = ["River", "Cloud", "Star", "Moon", "Leaf", "Wave", "Stone", "Light"];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = randomBytes(2).readUInt16BE(0) % 1000;
  return `${adj}${noun}${num}`;
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

  const accessToken = signAccessToken({
    userId: user.id,
    tier: user.subscriptionTier as SubscriptionTier,
  });
  const refreshToken = signRefreshToken({
    userId: user.id,
    tokenVersion: user.tokenVersion,
  });

  return { accessToken, refreshToken, user: { id: user.id, alias: user.anonymousAlias } };
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
