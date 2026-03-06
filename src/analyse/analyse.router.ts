import { Router } from "express";
import { z } from "zod";
import { analyseText } from "./analyse.service.js";
import { authMiddleware } from "../auth/auth.middleware.js";
import { apiLimiter } from "../shared/rate-limiter.js";
import { ValidationError } from "../shared/errors.js";
import { getDailyMatchStatus } from "../matching/matching.service.js";
import { getTierLimits } from "../config/tiers.js";
import { encrypt } from "../lib/crypto.js";
import { redis } from "../lib/redis.js";
import { SubscriptionTier } from "../shared/types.js";

const router = Router();

const analyseSchema = z.object({
  text: z
    .string()
    .min(10, "Please share a bit more about what you're going through")
    .max(500, "Text must be 500 characters or less"),
});

router.post("/", apiLimiter, authMiddleware, async (req, res, next) => {
  try {
    const parsed = analyseSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0].message);
    }

    const tier = req.user!.tier;
    const limits = getTierLimits(tier);

    // Rate limit: tie to daily match cap
    const status = await getDailyMatchStatus(req.user!.userId, tier);
    if (limits.dailyNewMatches > 0 && status.remaining <= 0) {
      res.status(429).json({
        error: "daily_match_limit_reached",
        limit: status.limit,
        resetsInSeconds: status.resetsInSeconds,
        upgradeTier: tier === SubscriptionTier.FREE ? "PREMIUM" : "PLUS",
      });
      return;
    }

    // Run AI analysis
    const result = await analyseText({
      text: parsed.data.text,
      userId: req.user!.userId,
      tier,
    });

    // Encrypt raw text and store temporarily in Redis (10 min TTL)
    const encrypted = encrypt(parsed.data.text);
    const tempKey = `analyse:pending:${req.user!.userId}`;
    await redis.set(
      tempKey,
      JSON.stringify({ encrypted, analysis: result }),
      "EX",
      600
    );

    res.json(result);
  } catch (err) {
    next(err);
  }
});

export { router as analyseRouter };
