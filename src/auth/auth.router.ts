import { Router } from "express";
import { z } from "zod";
import { createAnonymousUser, refreshTokens, upgradeWithEmail } from "./auth.service.js";
import { authMiddleware } from "./auth.middleware.js";
import { authLimiter } from "../shared/rate-limiter.js";
import { ValidationError } from "../shared/errors.js";

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

export { router as authRouter };
