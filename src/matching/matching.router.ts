import { Router } from "express";
import { z } from "zod";
import { joinQueue, leaveQueue, getDailyMatchStatus } from "./matching.service.js";
import { authMiddleware, requireTier, requireCompliance } from "../auth/auth.middleware.js";
import { apiLimiter } from "../shared/rate-limiter.js";
import { ValidationError, UpgradeRequiredError, ForbiddenError } from "../shared/errors.js";
import { hasValidConsent } from "../compliance/compliance.service.js";
import { getTierLimits } from "../config/tiers.js";
import { SubscriptionTier } from "../shared/types.js";
import { redis } from "../lib/redis.js";

const router = Router();

// All matching routes require completed compliance flow
router.use(authMiddleware, requireCompliance);

const joinSchema = z.object({
  // `category` accepted for backward wire compatibility with older builds but
  // ignored — every join is routed through the AI-prompt flow.
  category: z.string().optional(),
  subTag: z.string().optional(),
  keywords: z.array(z.string()).max(12).optional(),
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

    // All matching goes through the AI-prompt flow. The client must call
    // POST /match/analyse first, which caches the analysis+embedding in
    // analyse:pending:{userId}. Joining without that is rejected.
    const pendingKey = `analyse:pending:${req.user!.userId}`;
    const pendingData = await redis.get(pendingKey);
    if (!pendingData) {
      throw new ValidationError(
        "Please describe what's on your mind first so we can find a good match.",
      );
    }

    let embedding: number[] | undefined;
    let analysis: Record<string, unknown> | undefined;
    try {
      const pending = JSON.parse(pendingData);
      embedding = pending.analysis?.embedding;
      analysis = pending.analysis;
    } catch {
      throw new ValidationError("Your analysis expired. Please try again.");
    }
    if (!embedding) {
      throw new ValidationError("Your analysis expired. Please try again.");
    }

    // Keep subTag tier-gate, using the analysis-derived primary category.
    if (parsed.data.subTag && analysis?.primaryCategory) {
      // categories module already validated at the analyse step; we only
      // enforce the premium gate here.
      if (!limits.canUseSubTags) {
        throw new UpgradeRequiredError(SubscriptionTier.PREMIUM, "Premium sub-tags require an upgrade");
      }
    }

    await joinQueue({
      userId: req.user!.userId,
      category: "ai-prompt",
      subTag: parsed.data.subTag,
      tier: req.user!.tier,
      joinedAt: Date.now(),
      keywords: parsed.data.keywords,
      matchContext: parsed.data.matchContext ?? analysis,
      embedding,
    });

    const matchStatus = await getDailyMatchStatus(req.user!.userId, tier);
    res.json({ status: "queued", category: "ai-prompt", matchStatus });
  } catch (err) {
    next(err);
  }
});

router.get("/queue-status", apiLimiter, authMiddleware, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const proposalId = await redis.get(`match:pending:${userId}`);
    if (proposalId) {
      const proposalData = await redis.get(`match:proposal:${proposalId}`);
      if (proposalData) {
        const proposal = JSON.parse(proposalData);
        const isUserA = proposal.userAId === userId;
        const alreadyAccepted = isUserA ? proposal.userAAccepted : proposal.userBAccepted;
        if (!alreadyAccepted) {
          res.json({
            inQueue: true,
            activeSearches: [],
            pendingProposal: {
              proposalId,
              partnerSummary: isUserA ? proposal.userBSummary : proposal.userASummary,
              partnerCategory: isUserA ? proposal.userBCategory : proposal.userACategory,
            },
          });
          return;
        }
        // User already accepted — don't return proposal, fall through to show queue status
      }
    }
    const members = await redis.zrange("match:queue:global", 0, -1);
    const activeSearches: { category: string; joinedAt: number }[] = [];
    for (const m of members) {
      const parsed = JSON.parse(m);
      if (parsed.userId === userId) {
        activeSearches.push({ category: parsed.category ?? "ai-prompt", joinedAt: parsed.joinedAt });
      }
    }
    res.json({ inQueue: activeSearches.length > 0, activeSearches });
  } catch (err) {
    next(err);
  }
});

router.delete("/leave", apiLimiter, authMiddleware, async (req, res, next) => {
  try {
    await leaveQueue(req.user!.userId);
    res.json({ status: "left" });
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
