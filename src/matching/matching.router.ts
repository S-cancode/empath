import { Router } from "express";
import { z } from "zod";
import { joinQueue, leaveQueue, getDailyMatchStatus } from "./matching.service.js";
import { authMiddleware, requireTier } from "../auth/auth.middleware.js";
import { apiLimiter } from "../shared/rate-limiter.js";
import { ValidationError, UpgradeRequiredError, ForbiddenError } from "../shared/errors.js";
import { hasValidConsent } from "../compliance/compliance.service.js";
import { categories } from "../categories/categories.data.js";
import { getTierLimits } from "../config/tiers.js";
import { SubscriptionTier } from "../shared/types.js";

const router = Router();

const joinSchema = z.object({
  category: z.string().optional(),
  subTag: z.string().optional(),
  keywords: z.array(z.string()).max(12).optional(),
  intensity: z.number().int().min(1).max(5).optional(),
  matchContext: z.record(z.string(), z.unknown()).optional(),
});

router.get("/status", apiLimiter, authMiddleware, async (req, res, next) => {
  try {
    const status = await getDailyMatchStatus(req.user!.userId, req.user!.tier);
    res.json(status);
  } catch (err) {
    next(err);
  }
});

router.post("/join", apiLimiter, authMiddleware, async (req, res, next) => {
  try {
    const parsed = joinSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0].message);
    }

    const tier = req.user!.tier;
    const limits = getTierLimits(tier);

    // Check daily match limit
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

    // Check sensitive data consent before allowing matching
    const consent = await hasValidConsent(req.user!.userId);
    if (!consent) {
      throw new ForbiddenError("Sensitive data consent required to use matching. Please enable it in Settings.");
    }

    // Default to "ai-prompt" when no category provided (free-text prompt flow)
    const category = parsed.data.category || "ai-prompt";

    // Validate category if it's not ai-prompt
    if (category !== "ai-prompt" && !categories.some((c) => c.id === category)) {
      throw new ValidationError("Invalid category");
    }

    // Check premiumOnly sub-tag
    if (parsed.data.subTag && category !== "ai-prompt") {
      const cat = categories.find((c) => c.id === category);
      const tag = cat?.subTags.find((t) => t.id === parsed.data.subTag);
      if (tag?.premiumOnly && !limits.canUseSubTags) {
        throw new UpgradeRequiredError(SubscriptionTier.PREMIUM, "Premium sub-tags require an upgrade");
      }
    }

    await joinQueue({
      userId: req.user!.userId,
      category,
      subTag: parsed.data.subTag,
      tier: req.user!.tier,
      joinedAt: Date.now(),
      keywords: parsed.data.keywords,
      intensity: parsed.data.intensity,
      matchContext: parsed.data.matchContext,
    });

    const matchStatus = await getDailyMatchStatus(req.user!.userId, tier);
    res.json({ status: "queued", category, matchStatus });
  } catch (err) {
    next(err);
  }
});

router.delete("/leave", apiLimiter, authMiddleware, async (req, res, next) => {
  try {
    const category = req.query.category as string;
    if (!category) {
      throw new ValidationError("Category is required");
    }

    await leaveQueue(req.user!.userId, category);
    res.json({ status: "left", category });
  } catch (err) {
    next(err);
  }
});

// Stub: Match preferences (Premium+)
router.put("/preferences", apiLimiter, authMiddleware, requireTier(SubscriptionTier.PREMIUM), async (_req, res) => {
  res.status(501).json({ error: "not_implemented", message: "Match preferences coming soon" });
});

// Stub: Session scheduling (Plus only)
router.post("/schedule", apiLimiter, authMiddleware, requireTier(SubscriptionTier.PLUS), async (_req, res) => {
  res.status(501).json({ error: "not_implemented", message: "Session scheduling coming soon" });
});

export { router as matchingRouter };
