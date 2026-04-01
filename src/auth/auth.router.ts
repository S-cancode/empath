import { Router } from "express";
import { z } from "zod";
import { createAnonymousUser, refreshTokens, upgradeWithEmail } from "./auth.service.js";
import { authMiddleware } from "./auth.middleware.js";
import { authLimiter } from "../shared/rate-limiter.js";
import { ValidationError } from "../shared/errors.js";
import { prisma } from "../lib/prisma.js";

const router = Router();

const anonymousSchema = z.object({
  deviceId: z.string().min(1).max(256),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const upgradeSchema = z.object({
  email: z.string().email(),
});

router.post("/anonymous", authLimiter, async (req, res, next) => {
  try {
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
