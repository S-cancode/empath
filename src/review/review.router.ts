import { Router } from "express";
import { z } from "zod";
import { authMiddleware, requireCompliance } from "../auth/auth.middleware.js";
import {
  isReviewer,
  isReviewModeEnabled,
  redeemReviewAccess,
  ensureDemoConversation,
} from "./review.service.js";
import { reviewLimiter } from "../shared/rate-limiter.js";
import { NotFoundError, ValidationError } from "../shared/errors.js";

const router = Router();
router.use(authMiddleware, requireCompliance);

const redeemSchema = z.object({ code: z.string().min(1).max(256) });

/**
 * Redeem the App Review access code → durable review grant for the
 * authenticated user. Rate-limited (brute-force resistance). When review mode
 * is off the route is unavailable (404) and mutates nothing. The code is
 * verified server-side in constant time and never logged.
 */
router.post("/redeem", reviewLimiter, async (req, res, next) => {
  try {
    if (!isReviewModeEnabled()) {
      throw new NotFoundError("Not found");
    }
    const parsed = redeemSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError("Invalid request");
    }
    await redeemReviewAccess(req.user!.userId, parsed.data.code);
    res.json({ granted: true });
  } catch (err) {
    next(err);
  }
});

/**
 * Provision (idempotently) the reviewer's isolated scripted demo conversation.
 * Returns 404 for anyone who is not a granted reviewer, so the path is not
 * discoverable and cannot be used as a backdoor.
 */
router.post("/demo-conversation", async (req, res, next) => {
  try {
    if (!(await isReviewer(req.user!.userId))) {
      throw new NotFoundError("Not found");
    }
    const result = await ensureDemoConversation(req.user!.userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export { router as reviewRouter };
