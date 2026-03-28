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

  // Update lastActiveAt (throttled to every 5 min per user)
  const now = Date.now();
  const lastUpdate = lastActiveUpdates.get(req.user.userId) ?? 0;
  if (now - lastUpdate > ACTIVE_UPDATE_INTERVAL) {
    lastActiveUpdates.set(req.user.userId, now);
    try {
      prisma.user.update({
        where: { id: req.user.userId },
        data: { lastActiveAt: new Date() },
      })?.catch?.(() => {});
    } catch {}
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

export function assertTier(userTier: string, minimumTier: SubscriptionTier): void {
  const userRank = TIER_RANK[userTier] ?? 0;
  const requiredRank = TIER_RANK[minimumTier] ?? 0;
  if (userRank < requiredRank) {
    throw new UpgradeRequiredError(minimumTier);
  }
}
