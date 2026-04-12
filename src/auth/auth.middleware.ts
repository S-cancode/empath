import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "./auth.service.js";
import { prisma } from "../lib/prisma.js";
import { AuthError, ForbiddenError, UpgradeRequiredError } from "../shared/errors.js";
import { SubscriptionTier, type JwtPayload } from "../shared/types.js";

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

// Throttle lastActiveAt updates to once per 5 minutes per user
const lastActiveUpdates = new Map<string, number>();
const ACTIVE_UPDATE_INTERVAL = 5 * 60 * 1000;

// Periodic cleanup to prevent unbounded growth
setInterval(() => {
  const now = Date.now();
  for (const [key, ts] of lastActiveUpdates) {
    if (now - ts > ACTIVE_UPDATE_INTERVAL * 2) lastActiveUpdates.delete(key);
  }
}, 10 * 60 * 1000);

const TIER_RANK: Record<string, number> = {
  [SubscriptionTier.FREE]: 0,
  [SubscriptionTier.PREMIUM]: 1,
  [SubscriptionTier.PLUS]: 2,
};

export async function authMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new AuthError("Missing or malformed authorization header");
  }

  const token = header.slice(7);
  req.user = verifyAccessToken(token);

  // Check if user is banned or suspended
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: { banned: true, suspendedUntil: true },
  });

  if (user?.banned) {
    throw new ForbiddenError("Your account has been permanently banned");
  }

  if (user?.suspendedUntil && user.suspendedUntil > new Date()) {
    throw new ForbiddenError(
      `Your account is suspended until ${user.suspendedUntil.toISOString().split("T")[0]}`,
    );
  }

  // Update lastActiveAt (throttled to every 5 min per user).
  // The throttle is only advanced on a successful write so that a transient DB
  // failure doesn't lock lastActiveAt stale for the next 5 minutes.
  const now = Date.now();
  const userId = req.user.userId;
  const lastUpdate = lastActiveUpdates.get(userId) ?? 0;
  if (now - lastUpdate > ACTIVE_UPDATE_INTERVAL) {
    prisma.user
      .update({ where: { id: userId }, data: { lastActiveAt: new Date() } })
      .then(() => lastActiveUpdates.set(userId, now))
      .catch((err) => console.error("lastActiveAt update failed:", err));
  }

  next();
}

export function optionalAuthMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    try {
      const token = header.slice(7);
      req.user = verifyAccessToken(token);
    } catch {
      // Proceed without user
    }
  }
  next();
}

export function requireTier(minimumTier: SubscriptionTier) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const userTier = req.user?.tier ?? SubscriptionTier.FREE;
    const userRank = TIER_RANK[userTier] ?? 0;
    const requiredRank = TIER_RANK[minimumTier] ?? 0;

    if (userRank < requiredRank) {
      throw new UpgradeRequiredError(minimumTier);
    }
    next();
  };
}

export async function requireCompliance(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (!req.user) throw new AuthError("Authentication required");

  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: { ageConfirmedAt: true, sensitiveDataConsent: true },
  });

  if (!user?.ageConfirmedAt) {
    throw new ForbiddenError("Age verification required");
  }
  if (!user.sensitiveDataConsent) {
    throw new ForbiddenError("Sensitive data consent required");
  }

  next();
}

export function assertTier(userTier: string, minimumTier: SubscriptionTier): void {
  const userRank = TIER_RANK[userTier] ?? 0;
  const requiredRank = TIER_RANK[minimumTier] ?? 0;
  if (userRank < requiredRank) {
    throw new UpgradeRequiredError(minimumTier);
  }
}
