import { Router } from "express";
import { z } from "zod";
import { createAnonymousUser, refreshTokens, upgradeWithEmail, isAnonymousAuthAllowed } from "./auth.service.js";
import { signInWithApple } from "./apple.service.js";
import { handleAppleServerNotification, AppleNotificationError } from "./apple-notifications.js";
import { authMiddleware } from "./auth.middleware.js";
import { authLimiter, appleNotifyLimiter } from "../shared/rate-limiter.js";
import { ValidationError, ForbiddenError } from "../shared/errors.js";
import { prisma } from "../lib/prisma.js";

const router = Router();

const anonymousSchema = z.object({
  deviceId: z.string().min(1).max(256),
});

const appleSchema = z.object({
  identityToken: z.string().min(10),
  deviceId: z.string().min(1).max(256),
  // One-time authorization code for the server-to-server token exchange.
  // Optional: not every Sign in with Apple response includes one (e.g. silent
  // re-auth), and legacy clients don't send it.
  authorizationCode: z.string().min(1).max(2048).optional(),
});

router.post("/apple", authLimiter, async (req, res, next) => {
  try {
    const parsed = appleSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError("Invalid Apple sign-in payload");
    }
    const result = await signInWithApple(
      parsed.data.identityToken,
      parsed.data.deviceId,
      parsed.data.authorizationCode,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * Sign in with Apple server-to-server notifications (public, no user auth —
 * authenticity comes from Apple's JWT signature). Apple POSTs { payload: JWT }.
 * We ack 200 for anything we verified (including irrelevant events / unknown
 * subs, to avoid disclosure); a cryptographically invalid/malformed payload
 * gets 400 with no mutation.
 */
router.post("/apple/notifications", appleNotifyLimiter, async (req, res, next) => {
  try {
    await handleAppleServerNotification(req.body?.payload);
    res.status(200).json({ ok: true });
  } catch (err) {
    if (err instanceof AppleNotificationError) {
      res.status(400).json({ error: "invalid_notification" });
      return;
    }
    next(err);
  }
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const upgradeSchema = z.object({
  email: z.string().email(),
});

router.post("/anonymous", authLimiter, async (req, res, next) => {
  try {
    // Disposable identities defeat ban/report enforcement — production
    // requires Sign in with Apple (see isAnonymousAuthAllowed).
    if (!isAnonymousAuthAllowed()) {
      throw new ForbiddenError("Anonymous sign-in is not available. Please use Sign in with Apple.");
    }
    const parsed = anonymousSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError("Invalid device ID");
    }
    const result = await createAnonymousUser(parsed.data.deviceId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post("/refresh", authLimiter, async (req, res, next) => {
  try {
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError("Missing refresh token");
    }
    const result = await refreshTokens(parsed.data.refreshToken);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post("/upgrade", authLimiter, authMiddleware, async (req, res, next) => {
  try {
    const parsed = upgradeSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError("Invalid email address");
    }
    const user = await upgradeWithEmail(req.user!.userId, parsed.data.email);
    res.json({ email: user.email });
  } catch (err) {
    next(err);
  }
});

const aliasSchema = z.object({
  alias: z.string().min(2).max(24).regex(/^[a-zA-Z0-9_]+$/, "Letters, numbers, and underscores only"),
});

router.put("/alias", authLimiter, authMiddleware, async (req, res, next) => {
  try {
    const parsed = aliasSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0].message);
    }
    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data: { anonymousAlias: parsed.data.alias },
    });
    res.json({ alias: user.anonymousAlias });
  } catch (err) {
    next(err);
  }
});

export { router as authRouter };
